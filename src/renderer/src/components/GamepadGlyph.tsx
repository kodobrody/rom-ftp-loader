type FaceButtonName = 'a' | 'b' | 'x' | 'y'

interface FaceButtonGlyphProps {
  active: FaceButtonName
  className?: string
}

interface CircleMarkerProps {
  label: string
  className?: string
}

const baseDotClass = 'absolute h-1.5 w-1.5 rounded-full border border-zinc-300'

const dotClassFor = (isActive: boolean): string => {
  return isActive ? 'bg-zinc-200' : 'bg-transparent'
}

export const FaceButtonGlyph = ({ active, className }: FaceButtonGlyphProps): React.JSX.Element => {
  return (
    <span className={`relative inline-block h-5 w-5 ${className ?? ''}`.trim()}>
      <span
        className={`${baseDotClass} left-1/2 top-0 -translate-x-1/2 ${dotClassFor(active === 'y')}`}
      />
      <span
        className={`${baseDotClass} right-0 top-1/2 -translate-y-1/2 ${dotClassFor(active === 'b')}`}
      />
      <span
        className={`${baseDotClass} bottom-0 left-1/2 -translate-x-1/2 ${dotClassFor(active === 'a')}`}
      />
      <span
        className={`${baseDotClass} left-0 top-1/2 -translate-y-1/2 ${dotClassFor(active === 'x')}`}
      />
    </span>
  )
}

export const CircleMarker = ({ label, className }: CircleMarkerProps): React.JSX.Element => {
  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-zinc-300 px-1 text-[10px] font-semibold text-zinc-200 ${className ?? ''}`.trim()}
    >
      {label}
    </span>
  )
}
