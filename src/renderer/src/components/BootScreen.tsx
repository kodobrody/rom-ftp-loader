import { Card, Spinner } from '@heroui/react'

export const BootScreen = (): React.JSX.Element => {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center p-6">
      <Card>
        <Card.Content className="gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">ROM Downloader</p>
          <h1 className="text-3xl font-semibold text-zinc-100">Preparing library workspace</h1>
          <p className="text-sm text-zinc-300">
            Loading saved configuration, download queue state, and platform index.
          </p>
          <div className="flex items-center gap-3 pt-2 text-sm text-zinc-300">
            <Spinner color="success" />
            <span>Booting app...</span>
          </div>
        </Card.Content>
      </Card>
    </main>
  )
}