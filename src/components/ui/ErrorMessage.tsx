export function ErrorMessage({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">
      {message}
    </p>
  )
}
