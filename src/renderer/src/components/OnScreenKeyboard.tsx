import { Button, Card } from '@heroui/react'
import { forwardRef, useState } from 'react'
import { CircleMarker, FaceButtonGlyph } from './GamepadGlyph'

interface OnScreenKeyboardProps {
  rows: string[][]
  targetRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  onKeyPress: (key: string) => void
  onHide: () => void
  closeLabel: string
  previewVersion?: number
  showPreview?: boolean
  className?: string
  docked?: boolean
}

const keyButtonClass = 'min-w-11 px-3'
const wideKeyButtonClass = 'min-w-24 px-4'
const controlKeyButtonClass = 'min-w-28 px-4'
const layoutToggleButtonClass = 'min-w-20 px-3'

const symbolsRows: string[][] = [
  ['.', '-', '_', '@', ':', '/', '\\', '?', '#', '%'],
  ['!', '$', '&', '*', '+', '=', '~', '^', '|', ';'],
  ['(', ')', '[', ']', '{', '}', '"', "'", ',', '`']
]

const isLetterKey = (value: string): boolean => {
  return /^[a-z]$/i.test(value)
}

export const OnScreenKeyboard = forwardRef<HTMLElement, OnScreenKeyboardProps>(
  (
    {
      className,
      closeLabel,
      docked = false,
      onHide,
      onKeyPress,
      previewVersion,
      rows,
      showPreview = true,
      targetRef
    }: OnScreenKeyboardProps,
    ref
  ): React.JSX.Element => {
    void previewVersion
    const [shiftActive, setShiftActive] = useState(false)
    const [capsLockActive, setCapsLockActive] = useState(false)
    const [showSymbolsLayout, setShowSymbolsLayout] = useState(false)
    const target = targetRef.current
    const value = target?.value || ''
    const cursorPos = target?.selectionStart ?? value.length
    const beforeCursor = value.slice(0, cursorPos)
    const afterCursor = value.slice(cursorPos)

    const handleKeyboardKeyPress = (key: string): void => {
      if (key === '{shift}') {
        setShiftActive((state) => !state)
        return
      }

      if (key === '{caps}') {
        setCapsLockActive((state) => !state)
        return
      }

      if (isLetterKey(key)) {
        const shouldUppercase = capsLockActive !== shiftActive
        onKeyPress(shouldUppercase ? key.toUpperCase() : key.toLowerCase())

        if (shiftActive) {
          setShiftActive(false)
        }

        return
      }

      onKeyPress(key)

      if (shiftActive) {
        setShiftActive(false)
      }
    }

    const visibleRows = showSymbolsLayout ? symbolsRows : rows

    return (
      <section
        aria-label="On-screen keyboard"
        className={`${docked ? 'mt-3' : 'fixed inset-x-0 bottom-4 z-40 mx-auto w-full max-w-4xl px-4'} ${className ?? ''}`.trim()}
        ref={ref}
      >
        <Card className="border-none! outline-none!">
          <Card.Content className="gap-3 p-3">
            {showPreview ? (
              <div className="min-h-9 break-all rounded-lg  bg-black/30 px-3 py-2 text-sm text-zinc-200">
                {beforeCursor}
                <span
                  className="inline-block h-4 w-px animate-pulse align-middle bg-white"
                  style={{ animationDuration: '1s' }}
                />
                {afterCursor}
              </div>
            ) : null}
            <div className="grid gap-2">
              {visibleRows.map((row, rowIndex) => (
                <div
                  className="on-screen-keyboard__row flex justify-center gap-2"
                  key={`keyboard-row-${rowIndex}`}
                >
                  {row.map((key) => (
                    <Button
                      className={keyButtonClass}
                      data-key={key}
                      key={key}
                      onPress={() => handleKeyboardKeyPress(key)}
                      variant="tertiary"
                      autoFocus={showSymbolsLayout ? rowIndex === 0 && key === '.' : key === 'q'}
                    >
                      {isLetterKey(key)
                        ? capsLockActive !== shiftActive
                          ? key.toUpperCase()
                          : key.toLowerCase()
                        : key}
                    </Button>
                  ))}
                </div>
              ))}
              <div className="on-screen-keyboard__row flex justify-center gap-2">
                <Button
                  className={layoutToggleButtonClass}
                  data-key="{layout}"
                  onPress={() => setShowSymbolsLayout((state) => !state)}
                  variant="tertiary"
                >
                  {showSymbolsLayout ? 'ABC' : '123#'}
                </Button>
                <Button
                  className={keyButtonClass}
                  data-key="."
                  onPress={() => handleKeyboardKeyPress('.')}
                  variant="tertiary"
                >
                  .
                </Button>
                <Button
                  className={keyButtonClass}
                  data-key="/"
                  onPress={() => handleKeyboardKeyPress('/')}
                  variant="tertiary"
                >
                  /
                </Button>
                <Button
                  className={keyButtonClass}
                  data-key="{up}"
                  onPress={() => onKeyPress('{up}')}
                  variant="tertiary"
                >
                  ↑
                </Button>
                <Button
                  className="min-w-28 px-4"
                  data-key="{space}"
                  onPress={() => handleKeyboardKeyPress('{space}')}
                  variant="tertiary"
                >
                  <FaceButtonGlyph active="y" /> Space
                </Button>
                <Button
                  className="min-w-28 px-4"
                  data-key="{backspace}"
                  onPress={() => handleKeyboardKeyPress('{backspace}')}
                  variant="tertiary"
                >
                  <FaceButtonGlyph active="x" /> Backspace
                </Button>
              </div>
              <div className="on-screen-keyboard__row flex justify-center gap-2">
                <Button
                  className={keyButtonClass}
                  data-key="{left}"
                  onPress={() => onKeyPress('{left}')}
                  variant="tertiary"
                >
                  ←
                </Button>
                <Button
                  className={keyButtonClass}
                  data-key="{down}"
                  onPress={() => onKeyPress('{down}')}
                  variant="tertiary"
                >
                  ↓
                </Button>
                <Button
                  className={keyButtonClass}
                  data-key="{right}"
                  onPress={() => onKeyPress('{right}')}
                  variant="tertiary"
                >
                  →
                </Button>
                <Button
                  className={controlKeyButtonClass}
                  data-key="{shift}"
                  onPress={() => handleKeyboardKeyPress('{shift}')}
                  variant={shiftActive ? 'primary' : 'tertiary'}
                >
                  <CircleMarker label="L2" /> Shift
                </Button>
                <Button
                  className={controlKeyButtonClass}
                  data-key="{caps}"
                  onPress={() => handleKeyboardKeyPress('{caps}')}
                  variant={capsLockActive ? 'primary' : 'tertiary'}
                >
                  <CircleMarker label="L" /> Caps lock
                </Button>
                <Button
                  className={wideKeyButtonClass}
                  onPress={() => onKeyPress('{clear}')}
                  variant="tertiary"
                >
                  Clear
                </Button>
                <Button className={wideKeyButtonClass} onPress={onHide} variant="tertiary">
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

OnScreenKeyboard.displayName = 'OnScreenKeyboard'
