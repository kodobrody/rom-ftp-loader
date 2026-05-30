import { Button, Input, Modal } from '@heroui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import React, { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { AppConfig } from '../../../../shared/types'
import { useAppStateStore } from '../../store/appStateStore'
import { useSetupStore } from '../../store/setupStore'

interface SetupIgdbModalProps {
  isOpen: boolean
  onClose: () => void
}

const igdbSchema = z.object({
  clientId: z.string().trim().min(1, 'Client ID is required.'),
  clientSecret: z.string().min(1, 'Client Secret is required.')
})

type IgdbFormValues = z.infer<typeof igdbSchema>

const createIgdbFormValues = (config: AppConfig): IgdbFormValues => ({
  clientId: config.twitchClientId,
  clientSecret: config.twitchClientSecret
})

export const SetupIgdbModal = ({ isOpen, onClose }: SetupIgdbModalProps): React.JSX.Element => {
  const { config, persistConfig } = useSetupStore()
  const { setErrorMessage, setInfoMessage } = useAppStateStore()
  const [isSaving, setIsSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const defaultValues = useMemo(() => createIgdbFormValues(config), [config])

  const {
    formState: { errors, isValid },
    handleSubmit,
    register,
    reset
  } = useForm<IgdbFormValues>({
    defaultValues,
    mode: 'onChange',
    resolver: zodResolver(igdbSchema)
  })

  useEffect(() => {
    if (!isOpen) {
      return
    }

    reset(createIgdbFormValues(config))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubmitError(null)
  }, [config, isOpen, reset])

  const closeModal = (): void => {
    if (isSaving) {
      return
    }

    setSubmitError(null)
    onClose()
  }

  const handleSave = handleSubmit(async (values) => {
    const nextConfig = {
      ...config,
      twitchClientId: values.clientId.trim(),
      twitchClientSecret: values.clientSecret,
      twitchAccessToken: ''
    }

    setIsSaving(true)
    setSubmitError(null)
    setErrorMessage(null)
    setInfoMessage(null)

    try {
      const savedConfig = await persistConfig({
        twitchClientId: nextConfig.twitchClientId,
        twitchClientSecret: nextConfig.twitchClientSecret,
        twitchAccessToken: ''
      })

      if (savedConfig) {
        onClose()
      } else {
        setSubmitError('Failed to save IGDB settings.')
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to connect to IGDB via Twitch API.'
      )
    } finally {
      setIsSaving(false)
    }
  })

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeModal()
        }
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-xl">
          <Modal.Header>
            <Modal.Heading>IGDB (Twitch API) Details</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="p-2">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm text-zinc-300">Client ID</span>
                <Input
                  className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                  {...register('clientId')}
                  placeholder="Twitch Client ID"
                />
                {errors.clientId ? (
                  <span className="text-xs text-red-200">{errors.clientId.message}</span>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-zinc-300">Client Secret</span>
                <Input
                  className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                  type="password"
                  {...register('clientSecret')}
                  placeholder="Twitch Client Secret"
                />
                {errors.clientSecret ? (
                  <span className="text-xs text-red-200">{errors.clientSecret.message}</span>
                ) : null}
              </label>
            </div>
            {submitError ? (
              <div className="mt-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {submitError}
              </div>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button onPress={closeModal} variant="tertiary">
              Cancel
            </Button>
            <Button
              isDisabled={isSaving || !isValid}
              onPress={() => {
                void handleSave()
              }}
              variant="primary"
            >
              {isSaving ? 'Connecting...' : 'Save & Connect'}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
