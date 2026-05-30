import { Button, Input, Label, ListBox, Modal, Select } from '@heroui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import React, { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import type { AppConfig } from '../../../../shared/types'
import { useAppStateStore } from '../../store/appStateStore'
import { useSetupStore } from '../../store/setupStore'

export type ConnectionProtocol = 'ftp' | 'ftps' | 'sftp'

export interface ConnectionDraft {
  protocol: ConnectionProtocol
  hostname: string
  port: string
  path: string
  username: string
  password: string
}

const normalizePathInput = (pathInput: string): string => {
  const trimmed = pathInput.trim()

  if (!trimmed || trimmed === '/') {
    return '/'
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const getDefaultPort = (protocol: ConnectionProtocol): string => {
  if (protocol === 'sftp') {
    return '22'
  }

  if (protocol === 'ftps') {
    return '990'
  }

  return '21'
}

const parseProtocol = (value: string): ConnectionProtocol => {
  const normalized = value.toLowerCase().replace(':', '')

  if (normalized === 'sftp') {
    return 'sftp'
  }

  if (normalized === 'ftps') {
    return 'ftps'
  }

  return 'ftp'
}

const parseFtpParts = (
  ftpUrl: string
): { protocol: ConnectionProtocol; hostname: string; port: string; path: string } => {
  const fallback = { protocol: 'ftp' as const, hostname: '', port: '21', path: '/' }

  if (!ftpUrl.trim()) {
    return fallback
  }

  try {
    const normalizedUrl = ftpUrl.includes('://') ? ftpUrl : `ftp://${ftpUrl}`
    const parsedUrl = new URL(normalizedUrl)
    const protocol = parseProtocol(parsedUrl.protocol)

    return {
      protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || getDefaultPort(protocol),
      path: normalizePathInput(parsedUrl.pathname)
    }
  } catch {
    const detectedProtocol = ftpUrl.trim().match(/^(ftp|ftps|sftp):\/\//i)?.[1] || 'ftp'
    const protocol = parseProtocol(detectedProtocol)
    const withoutProtocol = ftpUrl.trim().replace(/^(?:ftp|ftps|sftp):\/\//i, '')
    const slashIndex = withoutProtocol.indexOf('/')
    const hostAndPort = slashIndex >= 0 ? withoutProtocol.slice(0, slashIndex) : withoutProtocol
    const path = slashIndex >= 0 ? withoutProtocol.slice(slashIndex) : '/'
    const hostPortMatch = hostAndPort.match(/^(.*?)(?::(\d+))?$/)

    return {
      protocol,
      hostname: (hostPortMatch?.[1] || '').trim(),
      port: hostPortMatch?.[2] || getDefaultPort(protocol),
      path: normalizePathInput(path)
    }
  }
}

const buildFtpUrl = (
  protocolInput: ConnectionProtocol,
  hostnameInput: string,
  portInput: string,
  pathInput: string
): string => {
  const protocol = parseProtocol(protocolInput)
  const hostname = hostnameInput
    .trim()
    .replace(/^(?:ftp|ftps|sftp):\/\//i, '')
    .replace(/\/.*/, '')

  if (!hostname) {
    return ''
  }

  const parsedPort = Number.parseInt(portInput, 10)
  const defaultPort = getDefaultPort(protocol)
  const normalizedPort =
    Number.isFinite(parsedPort) && parsedPort > 0 ? String(parsedPort) : defaultPort
  const path = normalizePathInput(pathInput)
  const portSegment = normalizedPort === defaultPort ? '' : `:${normalizedPort}`

  return `${protocol}://${hostname}${portSegment}${path}`
}

// eslint-disable-next-line react-refresh/only-export-components
export const createConnectionDraft = (config: {
  ftpUrl: string
  ftpUsername: string
  ftpPassword: string
}): ConnectionDraft => {
  const ftpParts = parseFtpParts(config.ftpUrl)

  return {
    ...ftpParts,
    username: config.ftpUsername,
    password: config.ftpPassword
  }
}

const connectionSchema = z.object({
  protocol: z.enum(['ftp', 'ftps', 'sftp']),
  hostname: z.string().trim().min(1, 'Hostname is required.'),
  port: z
    .string()
    .trim()
    .min(1, 'Port is required.')
    .regex(/^\d+$/, 'Port must contain only numbers.'),
  path: z.string().trim().min(1, 'Remote path is required.'),
  username: z.string().trim().min(1, 'Username is required.'),
  password: z.string().min(1, 'Password is required.')
})

type ConnectionFormValues = z.infer<typeof connectionSchema>

const createConnectionFormValues = (config: AppConfig): ConnectionFormValues => {
  const ftpParts = parseFtpParts(config.ftpUrl)

  return {
    protocol: ftpParts.protocol,
    hostname: ftpParts.hostname,
    port: ftpParts.port,
    path: ftpParts.path,
    username: config.ftpUsername,
    password: config.ftpPassword
  }
}

interface SetupConnectionModalProps {
  isOpen: boolean
  onClose: () => void
}

export const SetupConnectionModal = ({
  isOpen,
  onClose
}: SetupConnectionModalProps): React.JSX.Element => {
  const { config, persistConfig } = useSetupStore()
  const { setErrorMessage, setInfoMessage } = useAppStateStore()
  const [isSaving, setIsSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const defaultValues = useMemo(() => createConnectionFormValues(config), [config])

  const {
    control,
    getValues,
    formState: { errors, isValid },
    handleSubmit,
    register,
    reset,
    setValue,
    watch
  } = useForm<ConnectionFormValues>({
    defaultValues,
    mode: 'onChange',
    resolver: zodResolver(connectionSchema)
  })

  // eslint-disable-next-line react-hooks/incompatible-library
  const watchedProtocol = watch('protocol')

  useEffect(() => {
    if (!isOpen) {
      return
    }

    reset(createConnectionFormValues(config))
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
      ftpUrl: buildFtpUrl(values.protocol, values.hostname, values.port, values.path),
      ftpUsername: values.username,
      ftpPassword: values.password
    }

    setIsSaving(true)
    setSubmitError(null)
    setErrorMessage(null)
    setInfoMessage(null)

    try {
      await window.api.testFtpConnection(nextConfig)
      const savedConfig = await persistConfig(
        {
          ftpUrl: nextConfig.ftpUrl,
          ftpUsername: nextConfig.ftpUsername,
          ftpPassword: nextConfig.ftpPassword
        },
        { refreshLibrary: true }
      )

      if (savedConfig) {
        onClose()
      } else {
        setSubmitError('Failed to save the connection.')
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to connect to the selected service.'
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
            <Modal.Heading>Connection Details</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="p-2">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1">
                <Controller
                  control={control}
                  name="protocol"
                  render={({ field }) => (
                    <Select
                      aria-label="Service Type"
                      className="w-full"
                      selectedKey={field.value}
                      onSelectionChange={(value) => {
                        const nextProtocol = value as ConnectionProtocol
                        const currentPort = getValues('port')
                        const previousProtocol = field.value

                        field.onChange(nextProtocol)
                        if (!currentPort || currentPort === getDefaultPort(previousProtocol)) {
                          setValue('port', getDefaultPort(nextProtocol), {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true
                          })
                        }
                      }}
                    >
                      <Label>Service Type</Label>
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          <ListBox.Item id="ftp" textValue="FTP">
                            FTP
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                          <ListBox.Item id="ftps" textValue="FTPS">
                            FTPS
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                          <ListBox.Item id="sftp" textValue="SFTP">
                            SFTP
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  )}
                />
                {errors.protocol ? (
                  <span className="text-xs text-red-200">{errors.protocol.message}</span>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-zinc-300">Hostname</span>
                <Input
                  className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                  {...register('hostname')}
                  placeholder="example.com"
                />
                {errors.hostname ? (
                  <span className="text-xs text-red-200">{errors.hostname.message}</span>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-zinc-300">Port</span>
                <Input
                  className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                  {...register('port')}
                  placeholder={getDefaultPort(watchedProtocol)}
                />
                {errors.port ? (
                  <span className="text-xs text-red-200">{errors.port.message}</span>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-zinc-300">Remote Path</span>
                <Input
                  className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                  {...register('path')}
                  placeholder="/"
                />
                {errors.path ? (
                  <span className="text-xs text-red-200">{errors.path.message}</span>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-zinc-300">Username</span>
                <Input
                  className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                  {...register('username')}
                  placeholder="Username"
                />
                {errors.username ? (
                  <span className="text-xs text-red-200">{errors.username.message}</span>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-zinc-300">Password</span>
                <Input
                  className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                  type="password"
                  {...register('password')}
                  placeholder="Password"
                />
                {errors.password ? (
                  <span className="text-xs text-red-200">{errors.password.message}</span>
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
