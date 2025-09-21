import json
import os
import re
from dotenv import load_dotenv
from typing import Any, Dict

import google.generativeai as genai
from supabase import create_client, Client

# Import supabase and create client
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BUCKET = os.getenv("SUPABASE_BUCKET")

client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Import gemini api key
API_KEY = os.getenv("GOOGLE_API_KEY")
if API_KEY:
    genai.configure(api_key=API_KEY)

def _extract_json_object(text: str) -> Dict[str, Any]:
    """Best-effort extraction of a JSON object from a model response string.

    Ensures the result is a dict with the exact key 'risk_statment' -> list.
    """
    if not text:
        return {"risk_statment": []}

    # Strip markdown code fences if present
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Remove leading ```json or ``` and trailing ```
        cleaned = re.sub(r"^```[a-zA-Z]*\n", "", cleaned)
        cleaned = re.sub(r"\n```\s*$", "", cleaned)

    # Try direct load
    def _coerce(obj: Any) -> Dict[str, Any]:
        # Normalize several likely shapes into desired one
        if isinstance(obj, dict):
            if "risk_statment" in obj and isinstance(obj["risk_statment"], list):
                return {"risk_statment": obj["risk_statment"]}
            # Common misspellings/alternatives
            for k in ("risk_statements", "risk_statment_list", "risks", "items", "data"):
                if k in obj and isinstance(obj[k], list):
                    return {"risk_statment": obj[k]}
            # If dict but doesn't contain list, wrap none
            return {"risk_statment": []}
        if isinstance(obj, list):
            return {"risk_statment": obj}
        return {"risk_statment": []}

    try:
        parsed = json.loads(cleaned)
        return _coerce(parsed)
    except Exception:
        pass

    # Try to find the outermost JSON object
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = cleaned[start : end + 1]
        try:
            parsed = json.loads(candidate)
            return _coerce(parsed)
        except Exception:
            pass

    # Try to find the outermost JSON array
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start != -1 and end != -1 and end > start:
        candidate = cleaned[start : end + 1]
        try:
            parsed = json.loads(candidate)
            return _coerce(parsed)
        except Exception:
            pass

    return {"risk_statment": []}


def get_risk_statments(file_url: str):
    """Given a Supabase file path or public URL, return risk statements as:
    {
        "risk_statment": [
            {"statement": str, "explanation": str}, ...
        ]
    }
    """
    try:
        # Normalize: strip public URL prefix if provided
        prefix = "https://jmyrzhpfzcaebymsmjcm.supabase.co/storage/v1/object/public/ocr_bucket/"
        if file_url.startswith(prefix):
            file_url = file_url.replace(prefix, "", 1)

        # Download the file from Supabase storage
        response = client.storage.from_(BUCKET).download(file_url)
        content = json.loads(response.decode("utf-8")) if isinstance(response, (bytes, bytearray)) else json.loads(str(response))
        content = content.get("text")
        model = genai.GenerativeModel("gemini-2.5-flash")

        # Guard: if no content, return empty structure
        if not content or not isinstance(content, str) or not content.strip():
            return {"risk_statment": []}

        # Call Gemini API to extract risk statements
        prompt = f"""
        You are a risk identifier.
        INSTRUCTIONS:
        - All the below given instrictions are to specify risky statements only.
            Risky Clauses with Technical Terms:
                1. Lock-in Period

                "This agreement is subject to a mandatory lock-in period of 12 months. Should the
                Tenant vacate the premises before the expiration of this period for any reason
                whatsoever, they will be liable to pay the rent for the entire remaining
                duration of the lock-in period."

                Why it's risky:
                This clause forces the tenant to pay for the full term even if they have a
                legitimate reason to leave (like a job transfer), with no option for a smaller,
                more reasonable penalty.

                2. Notice Period

                "The Tenant must provide a written notice period of no less than 90 days before vacating
                the premises. Failure to provide adequate notice will result in the forfeiture
                of the entire security deposit and a penalty equivalent to one additional
                month's rent."

                Why it's risky: 
                A 90-day notice period is excessively long for a residential tenant. The double
                penalty (forfeiture and an extra month's rent) is punitive.

                3. Force Majeure

                "The Tenant's obligation to pay rent shall not be waived, excused, or reduced due to
                any event of Force Majeure, including but not limited to natural disasters,
                epidemics, government-mandated lockdowns, or any other event that renders the
                property temporarily uninhabitable."

                Why it's risky:
                This clause places all the risk of unforeseen, catastrophic events on the
                tenant, obligating them to pay rent for a property they may not be able to
                safely live in or access.

                4. Maintenance and Repair Charges

                "The Tenant
                shall be solely responsible for all maintenance and repairs, including those
                for major appliances (e.g., geyser, air conditioner) and structural elements,
                excluding only the foundation and outer walls. All repairs must be conducted by
                a Landlord-approved vendor at the Tenant's expense."

                Why it's risky:
                This shifts the landlord's fundamental responsibility for major systems and
                normal wear-and-tear onto the tenant, which can lead to huge, unexpected costs.

                5. Subletting

                "Subletting the property, in whole or in part, is strictly prohibited. Any unauthorized
                subletting will be considered a material breach of this agreement, resulting in
                immediate termination of the lease, eviction, and a penalty fee equivalent to
                three month's rent."

                Why it's risky:
                While prohibiting subletting is common, this clause imposes an extreme
                financial penalty and allows for immediate eviction without any room for
                discussion or remedy.

                6. Termination Clause (By Landlord)

                "Notwithstanding the fixed lease term, the Landlord reserves the right to terminate this
                agreement for any reason, or for no reason at all, by providing the Tenant with
                just 30 days' written notice."

                Why it's risky:
                This is often called a "termination for convenience" clause. It
                effectively nullifies the security of a fixed-term lease for the tenant,
                allowing the landlord to evict them on a whim.

                7. Indemnity Clause

                "The Tenant agrees to indemnify, defend, and hold harmless the Landlord from and against
                any and all claims, liabilities, and damages arising from any injury or damage
                occurring on the premises, caused by the Tenant, their guests, or any third
                party, regardless of whether the Landlord's own negligence contributed in part
                to such damage."

                Why it's risky:
                This is an overly broad indemnity clause. It forces the tenant to take
                financial and legal responsibility not just for their own actions, but
                potentially for the landlord's partial fault as well.

        TASK:
            - You are given a OCR extracted text from a rental agreement document.
            - Your task is to extract and list all the risky statements/clauses from the text using the above given instructions.
            - In statment you must provide the exact wording of the input text that you identify as risky.
            - In explanation you must provide a brief explanation of why the statement is considered risky.

        ANSWER FORMAT (STRICT):
            - Return ONLY a valid JSON object with this EXACT shape and key names (no markdown, no code fences, no extra commentary):
            {{
              "risk_statment": [
                {{ "statement": "...", "explanation": "..." }},
                {{ "statement": "...", "explanation": "..." }}
              ]
            }}

        INPUT TEXT:\n\n{content}\n\n
        """
        
        
        response = model.generate_content(prompt)

        # Parse model output into the requested structure
        parsed = _extract_json_object(response.text if hasattr(response, "text") else str(response))
        # Optional: basic sanitation of items
        items = []
        for it in parsed.get("risk_statment", []) or []:
            if not isinstance(it, dict):
                continue
            stmt = it.get("statement")
            expl = it.get("explanation")
            if isinstance(stmt, str) and isinstance(expl, str):
                items.append({"statement": stmt.strip(), "explanation": expl.strip()})

        result = {"risk_statment": items}
        # print(result)
        return result
    except Exception as e:
        raise Exception(f"Error in get_risk_statments: {str(e)}")
    

if __name__ == "__main__":
    # Example usage
    file_url = "https://jmyrzhpfzcaebymsmjcm.supabase.co/storage/v1/object/public/ocr_bucket/ocr/178b47dc-1b40-4b48-accb-81116faa7710.json"  # Replace with your actual file path or public URL
    risk_statements = get_risk_statments(file_url)
    print(risk_statements)