import StepWizard from "@/components/step-wizard"

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-5xl">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight">ClipFlow</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Éditez et préparez vos vidéos en quelques étapes simples.
          </p>
        </header>
        <StepWizard />
      </div>
    </main>
  )
}
