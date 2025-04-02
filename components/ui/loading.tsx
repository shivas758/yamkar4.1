export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#228B22] border-t-transparent" />
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    </div>
  )
}

