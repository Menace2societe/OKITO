import { AccessGate } from "@/components/access-gate"
import StepWizard from "@/components/step-wizard"

export default function Page() {
  return (
    <div className="univers-tirage min-h-screen">
      <AccessGate>
        <StepWizard />
      </AccessGate>
    </div>
  )
}
