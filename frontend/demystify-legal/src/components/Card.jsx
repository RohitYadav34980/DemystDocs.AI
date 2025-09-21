export default function Card({ title, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-8 rounded-2xl shadow-md hover:shadow-xl hover:-translate-y-1 transform transition">
      {title && (
        <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
          {title}
        </h3>
      )}
      <div>{children}</div>
    </div>
  );
}
