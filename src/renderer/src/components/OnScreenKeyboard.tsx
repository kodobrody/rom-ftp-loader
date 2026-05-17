import { Button, Card } from '@heroui/react'
import { forwardRef } from 'react'

interface OnScreenKeyboardProps {
  rows: string[][]
  targetRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  onKeyPress: (key: string) => void
  onHide: () => void
  closeLabel: string
  previewVersion?: number
  className?: string
  docked?: boolean
}

const keyButtonClass = 'min-w-11 px-3'
const wideKeyButtonClass = 'min-w-24 px-4'

export const OnScreenKeyboard = forwardRef<HTMLElement, OnScreenKeyboardProps>(
  ({ className, closeLabel, docked = false, onHide, onKeyPress, previewVersion, rows, targetRef }: OnScreenKeyboardProps, ref): React.JSX.Element => {
    void previewVersion
    const target = targetRef.current
    const value = target?.value || ''
    const cursorPos = target?.selectionStart ?? value.length
    const beforeCursor = value.slice(0, cursorPos)
    const afterCursor = value.slice(cursorPos)

    return (
      <section
        aria-label="On-screen keyboard"
        className={`${docked ? 'mt-3' : 'fixed inset-x-0 bottom-4 z-40 mx-auto w-full max-w-4xl px-4'} ${className ?? ''}`.trim()}
        ref={ref}
      >
        <Card className='border-none! outline-none!'>
          <Card.Content className="gap-3 p-3">
            <div className="min-h-9 break-all rounded-lg  bg-black/30 px-3 py-2 text-sm text-zinc-200">
              {beforeCursor}
              <span className="inline-block h-4 w-px animate-pulse align-middle bg-white" style={{ animationDuration: '1s' }} />
              {afterCursor}
            </div>
            <div className="grid gap-2">
              {rows.map((row, rowIndex) => (
                <div className="flex justify-center gap-2" key={`keyboard-row-${rowIndex}`}>
                  {row.map((key) => (
                    <Button
                      className={keyButtonClass}
                      data-key={key}
                      key={key}
                      onPress={() => onKeyPress(key)}
                      variant="tertiary"
                      autoFocus={key === 'q'}
                    >
                      {key}
                    </Button>
                  ))}
                </div>
              ))}
              <div className="flex justify-center gap-2">
                <Button
                  className={keyButtonClass}
                  onPress={() => onKeyPress('{up}')}
                  variant="tertiary"
                >
                  ↑
                </Button>
                <Button
                  className="min-w-28 px-4"
                  onPress={() => onKeyPress('{space}')}
                  variant="tertiary"
                >
                  Space
                </Button>
                <Button
                  className="min-w-28 px-4"
                  onPress={() => onKeyPress('{backspace}')}
                  variant="tertiary"
                >
                  ← Backspace
                </Button>
              </div>
              <div className="flex justify-center gap-2">
                <Button
                  className={keyButtonClass}
                  onPress={() => onKeyPress('{left}')}
                  variant="tertiary"
                >
                  ←
                </Button>
                <Button
                  className={keyButtonClass}
                  onPress={() => onKeyPress('{down}')}
                  variant="tertiary"
                >
                  ↓
                </Button>
                <Button
                  className={keyButtonClass}
                  onPress={() => onKeyPress('{right}')}
                  variant="tertiary"
                >
                  →
                </Button>
                <Button
                  className={wideKeyButtonClass}
                  onPress={() => onKeyPress('{clear}')}
                  variant="tertiary"
                >
                  Clear
                </Button>
                <Button
                  className={wideKeyButtonClass}
                  onPress={onHide}
                  variant="tertiary"
                >
                  {closeLabel}
                </Button>
              </div>
            </div>
          </Card.Content>
        </Card>
      </section>
    )
  }
)