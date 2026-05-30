import { Button, Input, Label, ListBox, Modal, Select } from '@heroui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import React, { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import type { AppConfig, FileServiceType } from '../../../../shared/types'
import { useAppStateStore } from '../../store/appStateStore'
import { useKeyboardModalStore } from '../../store/modals/keyboardModalStore'
import { useSetupStore } from '../../store/setupStore'

type HttpProtocol = 'http' | 'https'

type ConnectionProtocol = 'ftp' | 'ftps' | 'sftp' | 'http' | 'https'

const normalizePathInput = (pathInput: string): string => {
  const trimmed = pathInput.trim()

  if (!trimmed || trimmed === '/') {
    return '/'
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const getDefaultPort = (protocol: ConnectionProtocol, serviceType: FileServiceType): string => {
  if (serviceType === 'romm') {
    return protocol === 'https' ? '443' : '80'
  }

  if (serviceType === 'nextcloud') {
    return protocol === 'http' ? '80' : '443'
  }

  if (protocol === 'sftp') {
    return '22'
  }

  if (protocol === 'ftps') {
    return '990'
  }

  return '21'
}

const parseFtpProtocol = (value: string): 'ftp' | 'ftps' | 'sftp' => {
  const normalized = value.toLowerCase().replace(':', '')

  if (normalized === 'sftp') {
    return 'sftp'
  }

  if (normalized === 'ftps') {
    return 'ftps'
  }

  return 'ftp'
}

const parseHttpProtocol = (value: string): HttpProtocol => {
  return value.toLowerCase().replace(':', '') === 'http' ? 'http' : 'https'
}

const parseFtpParts = (
  ftpUrl: string
): { protocol: 'ftp' | 'ftps' | 'sftp'; hostname: string; port: string; path: string } => {
  const fallback = { protocol: 'ftp' as const, hostname: '', port: '21', path: '/' }

  if (!ftpUrl.trim()) {
    return fallback
  }

  try {
    const normalizedUrl = ftpUrl.includes('://') ? ftpUrl : `ftp://${ftpUrl}`
    const parsedUrl = new URL(normalizedUrl)
    const protocol = parseFtpProtocol(parsedUrl.protocol)

    return {
      protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || getDefaultPort(protocol, 'ftp'),
      path: normalizePathInput(parsedUrl.pathname)
    }
  } catch {
    const detectedProtocol = ftpUrl.trim().match(/^(ftp|ftps|sftp):\/\//i)?.[1] || 'ftp'
    const protocol = parseFtpProtocol(detectedProtocol)
    const withoutProtocol = ftpUrl.trim().replace(/^(?:ftp|ftps|sftp):\/\//i, '')
    const slashIndex = withoutProtocol.indexOf('/')
    const hostAndPort = slashIndex >= 0 ? withoutProtocol.slice(0, slashIndex) : withoutProtocol
    const path = slashIndex >= 0 ? withoutProtocol.slice(slashIndex) : '/'
    const hostPortMatch = hostAndPort.match(/^(.*?)(?::(\d+))?$/)

    return {
      protocol,
      hostname: (hostPortMatch?.[1] || '').trim(),
      port: hostPortMatch?.[2] || getDefaultPort(protocol, 'ftp'),
      path: normalizePathInput(path)
    }
  }
}

const parseHttpParts = (
  ftpUrl: string,
  defaultProtocol: HttpProtocol,
  serviceType: 'nextcloud' | 'romm'
): { protocol: HttpProtocol; hostname: string; port: string; path: string } => {
  const fallback = {
    protocol: defaultProtocol,
    hostname: '',
    port: getDefaultPort(defaultProtocol, serviceType),
    path: serviceType === 'nextcloud' ? '/' : '/api'
  }

  if (!ftpUrl.trim()) {
    return fallback
  }

  try {
    const normalizedUrl = ftpUrl.includes('://') ? ftpUrl : `${defaultProtocol}://${ftpUrl}`
    const parsedUrl = new URL(normalizedUrl)
    const protocol = parseHttpProtocol(parsedUrl.protocol)

    return {
      protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || getDefaultPort(protocol, serviceType),
      path: normalizePathInput(parsedUrl.pathname || fallback.path)
    }
  } catch {
    return fallback
  }
}

const buildFtpUrl = (
  protocolInput: ConnectionProtocol,
  serviceType: FileServiceType,
  hostnameInput: string,
  portInput: string,
  pathInput: string
): string => {
  const protocol =
    serviceType === 'romm' || serviceType === 'nextcloud'
      ? parseHttpProtocol(protocolInput)
      : parseFtpProtocol(protocolInput)
  const hostname = hostnameInput
    .trim()
    .replace(/^(?:ftp|ftps|sftp|http|https):\/\//i, '')
    .replace(/\/.*/, '')

  if (!hostname) {
    return ''
  }

  const parsedPort = Number.parseInt(portInput, 10)
  const defaultPort = getDefaultPort(protocol, serviceType)
  const normalizedPort =
    Number.isFinite(parsedPort) && parsedPort > 0 ? String(parsedPort) : defaultPort
  const path = normalizePathInput(pathInput)
  const portSegment = normalizedPort === defaultPort ? '' : `:${normalizedPort}`

  return `${protocol}://${hostname}${portSegment}${path}`
}

const connectionSchema = z
  .object({
    serviceType: z.enum(['ftp', 'ftps', 'sftp', 'nextcloud', 'romm']),
    protocol: z.enum(['ftp', 'ftps', 'sftp', 'http', 'https']),
    hostname: z.string().trim().min(1, 'Hostname is required.'),
    port: z
      .string()
      .trim()
      .min(1, 'Port is required.')
      .regex(/^\d+$/, 'Port must contain only numbers.'),
    path: z.string().trim().min(1, 'Remote path is required.'),
    username: z.string().trim(),
    password: z.string(),
    apiToken: z.string().trim()
  })
  .superRefine((values, context) => {
    if (values.serviceType === 'romm') {
      if (!values.apiToken) {
        context.addIssue({ code: 'custom', message: 'API token is required.', path: ['apiToken'] })
      }

      return
    }

    if (!values.username) {
      context.addIssue({ code: 'custom', message: 'Username is required.', path: ['username'] })
    }

    if (!values.password) {
      context.addIssue({ code: 'custom', message: 'Password is required.', path: ['password'] })
    }
  })

type ConnectionFormValues = z.infer<typeof connectionSchema>

const createConnectionFormValues = (config: AppConfig): ConnectionFormValues => {
  const serviceType = config.fileServiceType || 'ftp'

  if (serviceType === 'romm') {
    const parts = parseHttpParts(config.ftpUrl, 'http', 'romm')

    return {
      serviceType,
      protocol: parts.protocol,
      hostname: parts.hostname,
      port: parts.port,
      path: '/api',
      username: '',
      password: '',
      apiToken: config.rommApiToken
    }
  }

  if (serviceType === 'nextcloud') {
    const parts = parseHttpParts(config.ftpUrl, 'https', 'nextcloud')

    return {
      serviceType,
      protocol: parts.protocol,
      hostname: parts.hostname,
      port: parts.port,
      path: parts.path,
      username: config.ftpUsername,
      password: config.ftpPassword,
      apiToken: ''
    }
  }

  const ftpParts = parseFtpParts(config.ftpUrl)

  return {
    serviceType,
    protocol: ftpParts.protocol,
    hostname: ftpParts.hostname,
    port: ftpParts.port,
    path: ftpParts.path,
    username: config.ftpUsername,
    password: config.ftpPassword,
    apiToken: ''
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
  const { setKeyboardTarget, setShowOnScreenKeyboard } = useKeyboardModalStore()
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
  const watchedServiceType = watch('serviceType')
  const watchedProtocol = watch('protocol')
  const isHttpService = watchedServiceType === 'nextcloud' || watchedServiceType === 'romm'
  const ftpServiceProtocol: ConnectionProtocol =
    watchedServiceType === 'ftp' || watchedServiceType === 'ftps' || watchedServiceType === 'sftp'
      ? watchedServiceType
      : 'ftp'
  const selectedProtocol: ConnectionProtocol = isHttpService
    ? watchedProtocol === 'http' || watchedProtocol === 'https'
      ? watchedProtocol
      : 'https'
    : watchedProtocol === 'ftp' || watchedProtocol === 'ftps' || watchedProtocol === 'sftp'
      ? watchedProtocol
      : 'ftp'

  const handleTextInputClick = (event: React.MouseEvent<HTMLInputElement>): void => {
    if (config.inputKeyboardMode !== 'always') {
      return
    }

    setKeyboardTarget(event.currentTarget)
    setShowOnScreenKeyboard(true)
  }

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
    const remotePath = values.serviceType === 'romm' ? '/api' : values.path
    const protocolForSave: ConnectionProtocol =
      values.serviceType === 'nextcloud' || values.serviceType === 'romm'
        ? values.protocol
        : values.serviceType

    const nextConfig = {
      ...config,
      fileServiceType: values.serviceType,
      ftpUrl: buildFtpUrl(
        protocolForSave,
        values.serviceType,
        values.hostname,
        values.port,
        remotePath
      ),
      ftpUsername: values.serviceType === 'romm' ? '' : values.username,
      ftpPassword: values.serviceType === 'romm' ? '' : values.password,
      rommApiToken: values.serviceType === 'romm' ? values.apiToken : ''
    }

    setIsSaving(true)
    setSubmitError(null)
    setErrorMessage(null)
    setInfoMessage(null)

    try {
      await window.api.testFileServiceConnection(nextConfig)
      const savedConfig = await persistConfig(
        {
          fileServiceType: nextConfig.fileServiceType,
          ftpUrl: nextConfig.ftpUrl,
          ftpUsername: nextConfig.ftpUsername,
          ftpPassword: nextConfig.ftpPassword,
          rommApiToken: nextConfig.rommApiToken
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
                  name="serviceType"
                  render={({ field }) => (
                    <Select
                      aria-label="File service"
                      className="w-full"
                      selectedKey={field.value}
                      onSelectionChange={(value) => {
                        const nextService = value as FileServiceType

                        field.onChange(nextService)

                        if (nextService === 'nextcloud') {
                          setValue('protocol', 'https', { shouldDirty: true, shouldValidate: true })
                          setValue('port', '443', { shouldDirty: true, shouldValidate: true })
                        } else if (nextService === 'romm') {
                          setValue('protocol', 'http', { shouldDirty: true, shouldValidate: true })
                          setValue('port', '80', { shouldDirty: true, shouldValidate: true })
                          setValue('path', '/api', { shouldDirty: true, shouldValidate: true })
                        } else {
                          setValue('protocol', nextService, {
                            shouldDirty: true,
                            shouldValidate: true
                          })
                          setValue('port', getDefaultPort(nextService, nextService), {
                            shouldDirty: true,
                            shouldValidate: true
                          })
                        }
                      }}
                    >
                      <Label>File service</Label>
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
                          <ListBox.Item id="nextcloud" textValue="Nextcloud">
                            Nextcloud
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                          <ListBox.Item id="romm" textValue="RomM">
                            RomM
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  )}
                />
              </label>

              {isHttpService ? (
                <label className="grid gap-1">
                  <Controller
                    control={control}
                    name="protocol"
                    render={({ field }) => (
                      <Select
                        aria-label="Protocol"
                        className="w-full"
                        selectedKey={selectedProtocol}
                        onSelectionChange={(value) => {
                          const nextProtocol = value as ConnectionProtocol
                          const currentPort = getValues('port')
                          const previousProtocol = field.value

                          field.onChange(nextProtocol)
                          if (
                            !currentPort ||
                            currentPort === getDefaultPort(previousProtocol, watchedServiceType)
                          ) {
                            setValue('port', getDefaultPort(nextProtocol, watchedServiceType), {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true
                            })
                          }
                        }}
                      >
                        <Label>Protocol</Label>
                        <Select.Trigger>
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            <ListBox.Item id="http" textValue="HTTP">
                              HTTP
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="https" textValue="HTTPS">
                              HTTPS
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
              ) : null}

              <label className="grid gap-1">
                <span className="text-sm text-zinc-300">Hostname</span>
                <Input
                  className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                  onClick={handleTextInputClick}
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
                  onClick={handleTextInputClick}
                  {...register('port')}
                  placeholder={getDefaultPort(
                    isHttpService ? selectedProtocol : ftpServiceProtocol,
                    watchedServiceType
                  )}
                />
                {errors.port ? (
                  <span className="text-xs text-red-200">{errors.port.message}</span>
                ) : null}
              </label>

              {watchedServiceType !== 'romm' ? (
                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">Remote Path</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    onClick={handleTextInputClick}
                    {...register('path')}
                    placeholder="/"
                  />
                  {errors.path ? (
                    <span className="text-xs text-red-200">{errors.path.message}</span>
                  ) : null}
                </label>
              ) : null}

              {watchedServiceType === 'romm' ? (
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-sm text-zinc-300">API Token</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    onClick={handleTextInputClick}
                    type="password"
                    {...register('apiToken')}
                    placeholder="RomM API token"
                  />
                  {errors.apiToken ? (
                    <span className="text-xs text-red-200">{errors.apiToken.message}</span>
                  ) : null}
                </label>
              ) : (
                <>
                  <label className="grid gap-1">
                    <span className="text-sm text-zinc-300">Username</span>
                    <Input
                      className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                      onClick={handleTextInputClick}
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
                      onClick={handleTextInputClick}
                      type="password"
                      {...register('password')}
                      placeholder="Password"
                    />
                    {errors.password ? (
                      <span className="text-xs text-red-200">{errors.password.message}</span>
                    ) : null}
                  </label>
                </>
              )}
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
