export default function ToastStack({ toasts }) {
  return (
    <aside className="toast-wrap">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          {toast.message}
        </div>
      ))}
    </aside>
  )
}
