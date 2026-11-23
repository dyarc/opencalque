import { searchable } from './search'
import { useEffect, useMemo, useState } from 'react'
import { Bot, Keyboard, PencilRuler, Puzzle, Settings2, type LucideIcon } from 'lucide-react'
import { allCommands, eventKey, executeById, formatKey, isCustomised, keysOf, RESERVED_KEYS, resetShortcut, setShortcut, useCommands, type Command } from './commands'
import { resetLayout } from './dock'
import { LANGUAGES, msg, t } from './i18n'
import { platform } from './platform'
import { CLAUDE_MODELS, setAiPrefs, setPrefs, usePrefs } from './prefs'
import { BUILT_IN_EXTENSION } from './extensions'
import { REPOSITORY } from './release'
import { Select } from './Select'
import { useStore } from './store'
import { toast, useWindows } from './windows'
import { FRACTIONS, UNITS } from './units'
import { ExtensionWarehouse } from './WarehouseDialog'

const close = () => useWindows.setState({ preferencesOpen: false })

/** Says how a key is kept: encrypted by the system where the app can have it so (`keepKeysIn`), in plain text otherwise. */
function KeyNote(props: { encrypted: string; plain: string }) {
  const [encrypted, setEncrypted] = useState(false)
  useEffect(() => {
    void platform.secrets?.available().then(setEncrypted)
  }, [])
  return <p className="hint">{encrypted ? props.encrypted : props.plain}</p>
}

/** What a setting does, said under it: a sentence, or what is given as it is. */
function Hint({ hint }: { hint?: React.ReactNode }) {
  if (hint === undefined || hint === null || hint === false) return null
  return typeof hint === 'string' ? <p className="hint">{hint}</p> : <>{hint}</>
}

/** A titled part of a page of the preferences: its settings in one box, one under another. */
function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="pref-section">
      <h3 className="pref-heading">{props.title}</h3>
      <div className="pref-card">{props.children}</div>
    </section>
  )
}

/** One setting: its name on the left, what sets it on the right, what it does under both. */
function Setting(props: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="pref-item">
      <label className="pref-field">
        <span>{props.label}</span>
        {props.children}
      </label>
      <Hint hint={props.hint} />
    </div>
  )
}

function Toggle(props: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: React.ReactNode }) {
  return (
    <div className="pref-item">
      <label className="pref-row">
        <span>{props.label}</span>
        <input type="checkbox" role="switch" className="pref-switch" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      </label>
      <Hint hint={props.hint} />
    </div>
  )
}

/** A text setting saved when the field is left, so a key is not written to storage on every keystroke. */
function TextSetting(props: { label: string; value: string; secret?: boolean; placeholder?: string; hint?: React.ReactNode; onCommit: (value: string) => void }) {
  const [text, setText] = useState(props.value)
  useEffect(() => {
    setText(props.value)
  }, [props.value])
  return (
    <Setting label={props.label} hint={props.hint}>
      <input
        type={props.secret ? 'password' : 'text'}
        autoComplete="off"
        spellCheck={false}
        placeholder={props.placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== props.value && props.onCommit(text.trim())}
      />
    </Setting>
  )
}

/** Everything that lets AI reach a drawing: the assistant in the app, then agents outside it where the app can let them in. */
function AiSettings() {
  return (
    <>
      <Section title={t('Assistant')}>
        <AssistantSettings />
      </Section>
      {platform.agentBridge && (
        <Section title={t('Agents')}>
          <AgentSettings />
        </Section>
      )}
    </>
  )
}

function AssistantSettings() {
  const ai = usePrefs((p) => p.ai)
  const custom = !CLAUDE_MODELS.some(([id]) => id === ai.anthropic.model)
  return (
    <>
      <Setting label={t('Provider')} hint={t('When you use the assistant, your drawing is sent to the provider you chose. Imported pictures are left out unless the assistant asks to look at one.')}>
        <Select
          value={ai.provider}
          onChange={(provider) => setAiPrefs({ provider: provider as typeof ai.provider })}
          options={[
            { value: 'anthropic', label: t('Claude, with an API key') },
            // Starting a program is something only the desktop app can do.
            { value: 'claude-cli', disabled: !platform.claudeCli, label: platform.claudeCli ? t('Claude, through the Claude Code CLI on this computer') : t('Claude Code CLI (desktop app only)') },
            { value: 'ollama', label: t('Local model, through Ollama') },
            { value: 'compatible', label: t('Other (OpenAI-compatible)') },
          ]}
        />
      </Setting>

      {ai.provider === 'anthropic' && (
        <>
          <TextSetting
            label={t('API key')}
            secret
            placeholder="sk-ant-…"
            value={ai.anthropic.apiKey}
            onCommit={(apiKey) => setAiPrefs({ anthropic: { ...ai.anthropic, apiKey } })}
            hint={
              <>
                <p className="hint">{t('Create a key at console.anthropic.com. Usage is billed to your Anthropic account.')}</p>
                <KeyNote encrypted={t('The key is stored on this computer, encrypted by the system, and is sent only to Anthropic.')} plain={t('The key is stored on this computer, unencrypted, and is sent only to Anthropic.')} />
              </>
            }
          />
          <Setting label={t('Model')}>
            <Select
              value={custom ? '' : ai.anthropic.model}
              onChange={(model) => setAiPrefs({ anthropic: { ...ai.anthropic, model } })}
              options={[...CLAUDE_MODELS.map(([id, label]) => ({ value: id, label: t(label) })), ...(custom ? [{ value: '', label: ai.anthropic.model }] : [])]}
            />
          </Setting>
        </>
      )}

      {ai.provider === 'claude-cli' && (
        <TextSetting
          label={t('Model')}
          placeholder={t('Leave empty to use the CLI’s default')}
          value={ai.claudeCli.model}
          onCommit={(model) => setAiPrefs({ claudeCli: { model } })}
          hint={
            <>
              <p className="hint">{t('Uses the Claude Code command-line program installed on this computer, with the account it is signed in to, so no API key is needed here. It must be installed and signed in (run “claude” in a terminal once).')}</p>
              <p className="hint">{t('It runs with its command and file tools switched off, in an empty folder. It cannot look at imported pictures.')}</p>
            </>
          }
        />
      )}

      {ai.provider === 'ollama' && (
        <>
          <TextSetting label={t('Model')} placeholder={t('A model you have pulled, as listed by “ollama list”')} value={ai.ollama.model} onCommit={(model) => setAiPrefs({ ollama: { ...ai.ollama, model } })} />
          <TextSetting
            label={t('Address')}
            value={ai.ollama.baseUrl}
            onCommit={(baseUrl) => setAiPrefs({ ollama: { ...ai.ollama, baseUrl } })}
            hint={
              <>
                <p className="hint">{t('Runs entirely on this computer: nothing is sent over the internet. The model must support tool calling.')}</p>
                {!platform.desktop && <p className="hint">{t('In a browser, Ollama must be told to accept requests from this page (its OLLAMA_ORIGINS setting). The desktop app does not need that.')}</p>}
              </>
            }
          />
        </>
      )}

      {ai.provider === 'compatible' && (
        <>
          <TextSetting label={t('Address')} placeholder="https://api.openai.com/v1" value={ai.compatible.baseUrl} onCommit={(baseUrl) => setAiPrefs({ compatible: { ...ai.compatible, baseUrl } })} />
          <TextSetting label={t('Model')} placeholder={t('The model name your service expects')} value={ai.compatible.model} onCommit={(model) => setAiPrefs({ compatible: { ...ai.compatible, model } })} />
          <TextSetting
            label={t('API key')}
            secret
            value={ai.compatible.apiKey}
            onCommit={(apiKey) => setAiPrefs({ compatible: { ...ai.compatible, apiKey } })}
            hint={
              <>
                <p className="hint">{t('Works with any service that accepts the OpenAI chat-completions format and supports tool calling.')}</p>
                <KeyNote encrypted={t('The key is stored on this computer, encrypted by the system, and is sent only to the address above.')} plain={t('The key is stored on this computer, unencrypted, and is sent only to the address above.')} />
              </>
            }
          />
        </>
      )}
    </>
  )
}

/** A word of a command line, quoted unless it is plain: a path on Windows has backslashes, and often spaces. */
const shellWord = (word: string) => (/^[\w./:=-]+$/.test(word) ? word : `"${word}"`)

/** Agents outside the app: whether they may work on the open drawing, and how to connect one. */
function AgentSettings() {
  const agentBridge = usePrefs((p) => p.agentBridge)
  const [connect, setConnect] = useState('')
  useEffect(() => {
    void platform.agentBridge?.command().then(({ command, args }) => setConnect(`claude mcp add opencalque-live -- ${[command, ...args].map(shellWord).join(' ')}`))
  }, [])
  const copy = () => void navigator.clipboard.writeText(connect).then(() => toast(t('Copied to the clipboard')))
  return (
    <>
      <Toggle
        label={t('Let agents on this computer work on the open drawing')}
        checked={agentBridge}
        onChange={(on) => setPrefs({ agentBridge: on })}
        hint={
          <>
            <p className="hint">{t('Programs on this computer that know how to reach it, such as Claude Code through the AxioDraw MCP server, can then read the open drawing and change it. Each change can be undone.')}</p>
            <p className="hint">{t('Any program you run on this computer can then reach the open drawing, so turn this off when you are not using it.')}</p>
          </>
        }
      />
      <div className="pref-item">
        <p className="hint">{t('To connect Claude Code, run this once in a terminal:')}</p>
        {connect && (
          <div className="pref-command">
            <code>{connect}</code>
            <button className="text-button" onClick={copy}>
              {t('Copy')}
            </button>
          </div>
        )}
        <p className="hint">
          <a href={`${REPOSITORY}#ai-agents`} target="_blank" rel="noreferrer">
            {t('Other agents, and working on files')}
          </a>
        </p>
      </div>
    </>
  )
}

function GeneralSettings() {
  const prefs = usePrefs()
  return (
    <>
      <Section title={t('Language and appearance')}>
        <Setting label={t('Language')}>
          <Select value={prefs.language} onChange={(language) => setPrefs({ language })} options={[{ value: 'auto', label: t('Same as the system') }, ...LANGUAGES.map(([code, name]) => ({ value: code, label: name }))]} />
        </Setting>
        <Setting label={t('Theme')}>
          <Select
            value={prefs.theme}
            onChange={(theme) => setPrefs({ theme: theme as typeof prefs.theme })}
            options={[
              { value: 'system', label: t('Same as the system') },
              { value: 'light', label: t('Light') },
              { value: 'dark', label: t('Dark') },
              { value: 'graphite', label: t('Graphite') },
              { value: 'paper', label: t('Paper') },
              { value: 'blueprint', label: t('Blueprint') },
              { value: 'sage', label: t('Sage') },
              { value: 'solarized', label: t('Solarized') },
              { value: 'ink', label: t('Ink (high contrast)') },
            ]}
          />
        </Setting>
        {prefs.theme !== 'light' && (
          <Toggle
            label={t('Dark drawing area')}
            checked={prefs.darkCanvas}
            onChange={(darkCanvas) => setPrefs({ darkCanvas })}
            hint={t('In the dark theme, the drawing is shown light on dark. Turned off, it keeps the colours it will have on paper. Exports are never changed.')}
          />
        )}
        <div className="pref-item">
          <button className="text-button" onClick={resetLayout}>
            {t('Reset the panel layout')}
          </button>
        </div>
      </Section>
      <Section title={t('Units')}>
        <Setting label={t('Unit')} hint={t('Lengths are shown and typed in this unit. A different unit can always be typed after a number, such as 350 cm.')}>
          <Select value={prefs.unit} onChange={(unit) => setPrefs({ unit: unit as typeof prefs.unit })} options={UNITS.map(([code, name]) => ({ value: code, label: t(name) }))} />
        </Setting>
        {prefs.unit === 'ft-in' && (
          <Setting label={t('To the nearest')}>
            <Select value={String(prefs.fraction)} onChange={(fraction) => setPrefs({ fraction: Number(fraction) })} options={FRACTIONS.map((under) => ({ value: String(under), label: `1/${under}"` }))} />
          </Setting>
        )}
        <Setting label={t('Decimal mark')} hint={t('Numbers in the panels are shown with it, and new drawings write theirs with it; a drawing’s own is in File › Drawing settings. Either mark can be typed.')}>
          <Select
            value={prefs.decimal}
            onChange={(decimal) => setPrefs({ decimal: decimal as typeof prefs.decimal })}
            options={[
              { value: 'auto', label: t('As the language writes it') },
              { value: '.', label: t('With a point: 1.5') },
              { value: ',', label: t('With a comma: 1,5') },
            ]}
          />
        </Setting>
      </Section>
      <Section title={t('Starting and saving')}>
        <Toggle
          label={t('Save automatically')}
          checked={prefs.autosave}
          onChange={(autosave) => setPrefs({ autosave })}
          hint={t('A drawing is saved to its file a moment after each change. A new drawing has to be saved once first, to give it a file.')}
        />
        <Toggle label={t('Show the welcome window when the app starts')} checked={prefs.showWelcome} onChange={(showWelcome) => setPrefs({ showWelcome })} />
        {platform.checkForUpdate && (
          <Toggle
            label={t('Check for a new version when the app starts')}
            checked={prefs.checkUpdates}
            onChange={(checkUpdates) => setPrefs({ checkUpdates })}
            hint={t('AxioDraw asks GitHub, where it is published, whether a newer version is out. Where it can, it downloads it and installs it when the app closes.')}
          />
        )}
      </Section>
    </>
  )
}

/** How far the speed of a zoom may be set, as a multiple of the usual speed. */
const MIN_ZOOM_SPEED = 0.2
const MAX_ZOOM_SPEED = 4

/**
 * How fast a pinch or Ctrl-wheel zooms, set by its slider or by the number beside it. A number is
 * taken when it is done being typed (Enter, or leaving the field), so that typing 0.5 does not
 * zoom by 0.2 on the way.
 */
function ZoomSpeed() {
  const speed = usePrefs((state) => state.zoomSpeed)
  const [typed, setTyped] = useState(String(speed))
  // The field follows the slider, and a speed read from storage.
  useEffect(() => setTyped(String(speed)), [speed])
  const commit = () => {
    const number = Number(typed)
    const next = Number.isFinite(number) ? Math.min(MAX_ZOOM_SPEED, Math.max(MIN_ZOOM_SPEED, number)) : speed
    setPrefs({ zoomSpeed: next })
    setTyped(String(next))
  }
  return (
    <div className="zoom-speed">
      <input
        type="range"
        min={MIN_ZOOM_SPEED}
        max={MAX_ZOOM_SPEED}
        step={0.05}
        value={speed}
        aria-label={t('Zoom speed')}
        onChange={(e) => setPrefs({ zoomSpeed: Number(e.target.value) })}
      />
      <input
        type="number"
        min={MIN_ZOOM_SPEED}
        max={MAX_ZOOM_SPEED}
        step={0.05}
        value={typed}
        aria-label={t('Zoom speed')}
        onChange={(e) => setTyped(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          commit()
          e.currentTarget.blur()
        }}
      />
      <span aria-hidden="true">×</span>
    </div>
  )
}

function DrawingSettings() {
  const prefs = usePrefs()
  return (
    <>
      <Section title={t('Grid and snapping')}>
        <Toggle label={t('Show the grid')} checked={prefs.showGrid} onChange={(showGrid) => setPrefs({ showGrid })} />
        <Toggle label={t('Snap to the grid')} checked={prefs.snapToGrid} onChange={(snapToGrid) => setPrefs({ snapToGrid })} />
        <Toggle
          label={t('Snap to existing objects, and line up what is moved with them')}
          checked={prefs.snapToObjects}
          onChange={(snapToObjects) => setPrefs({ snapToObjects })}
          hint={
            <>
              <p className="hint">{t('A point being placed snaps to the points of objects, the middle of a line, where two lines cross, the foot of a perpendicular, or the line itself. An object being moved lines up with the sides and middles of the others, and keeps equal gaps with its neighbours.')}</p>
              <p className="hint">{t('Holding Alt while drawing or moving turns snapping off for that moment.')}</p>
            </>
          }
        />
      </Section>
      <Section title={t('View')}>
        <Setting label={t('Zoom speed')} hint={t('How fast pinching or Ctrl-wheel zooms the drawing. 1 is the default, and 2 zooms twice as fast.')}>
          <ZoomSpeed />
        </Setting>
      </Section>
      <Section title={t('Selection')}>
        <Setting label={t('Selection box')} hint={t('How a box selects: drag from the first corner to the second, or click the first corner, move, and click the second, as in AutoCAD.')}>
          <Select
            value={prefs.selectionMode}
            onChange={(selectionMode) => setPrefs({ selectionMode: selectionMode as typeof prefs.selectionMode })}
            options={[
              { value: 'drag', label: t('Drag: press, drag, release') },
              { value: 'click', label: t('Click: click, move, click (AutoCAD)') },
            ]}
          />
        </Setting>
      </Section>
      <Section title={t('Groups and components')}>
        <Setting label={t('Editing inside a group')}>
          <Select
            value={prefs.editGroups}
            onChange={(editGroups) => setPrefs({ editGroups: editGroups as typeof prefs.editGroups })}
            options={[
              { value: 'faded', label: t('Show the rest of the drawing faded') },
              { value: 'alone', label: t('Show the group alone') },
            ]}
          />
        </Setting>
        <Setting
          label={t('Editing a component')}
          hint={t('Faded, the rest of the drawing can be snapped to but not selected. A component opened from the Components panel or the object library, or placed both stretched and turned, is always shown alone.')}
        >
          <Select
            value={prefs.editComponents}
            onChange={(editComponents) => setPrefs({ editComponents: editComponents as typeof prefs.editComponents })}
            options={[
              { value: 'faded', label: t('Show the rest of the drawing faded') },
              { value: 'alone', label: t('Show the component alone') },
            ]}
          />
        </Setting>
      </Section>
    </>
  )
}

const matches = (command: Command, query: string) => {
  const text = searchable(`${t(command.category)} ${t(command.title)} ${command.category} ${command.title} ${command.keywords ?? ''} ${keysOf(command).map(formatKey).join(' ')}`)
  return searchable(query).split(/\s+/).every((word) => text.includes(word))
}

/** Every command with its shortcut, to look through and to change. */
function ShortcutSettings() {
  const overrides = useCommands((s) => s.overrides)
  const [query, setQuery] = useState('')
  /** Id of the command whose shortcut is being recorded, and the letters typed for it so far. */
  const [recording, setRecording] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  // `overrides` is a dependency so that the shortcuts shown stay current after a change.
  const commands = useMemo(() => allCommands().filter((c) => matches(c, query)), [query, overrides])

  const record = (e: React.KeyboardEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    const native = e.nativeEvent
    // A command shortcut is a word of one to three letters, ended by Space; a chord with Ctrl, Alt
    // or Cmd is still taken at once, as special keys are.
    // A letter typed on its own is the start of a word; with Shift it is a chord like any other,
    // so that Shift+D can be given to a command.
    if (!native.ctrlKey && !native.metaKey && !native.altKey && !native.shiftKey && /^[a-z]$/i.test(native.key) && !native.key.startsWith('Dead')) {
      if (typed.length < 3) setTyped(typed + native.key.toUpperCase())
      return
    }
    if (native.key === ' ') {
      if (typed) commit(id, typed)
      else setRecording(null)
      return
    }
    if (native.key === 'Backspace') return setTyped(typed.slice(0, -1))
    if (native.key === 'Delete') return commit(id, null)
    if (native.key === 'Escape') {
      setTyped('')
      return setRecording(null)
    }
    const key = eventKey(native)
    if (!key) return
    if (RESERVED_KEYS.includes(key)) return toast(t('{key} is reserved and cannot be reassigned', { key: formatKey(key) }))
    commit(id, key)
  }

  const commit = (id: string, key: string | null) => {
    if (key === null) setShortcut(id, null)
    else {
      const taken = setShortcut(id, key)
      if (taken.length > 0) toast(t('{key} was removed from: {commands}', { key: formatKey(key), commands: taken.map((title) => t(title)).join(', ') }))
    }
    setTyped('')
    setRecording(null)
  }

  return (
    <>
      <p className="hint">{t('Click a shortcut, then type one to three letters and press Space. Backspace removes a letter, Delete removes the shortcut; Esc leaves it as it is.')}</p>
      <div className="shortcut-bar">
        <input placeholder={t('Search a command or a key…')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="text-button" onClick={() => executeById('shortcuts.reset')}>
          {t('Reset all shortcuts')}
        </button>
        <button className="text-button" title={t('Export keyboard shortcuts…')} onClick={() => executeById('shortcuts.export')}>
          {t('Export…')}
        </button>
        <button className="text-button" title={t('Import keyboard shortcuts…')} onClick={() => executeById('shortcuts.import')}>
          {t('Import…')}
        </button>
      </div>
      <div className="shortcut-list">
        {commands.length === 0 && <p className="hint">{t('Nothing matches.')}</p>}
        {commands.map((command) => {
          const keys = keysOf(command, overrides)
          return (
            <div key={command.id} className="shortcut-row">
              <span className="faint">{t(command.category)}</span>
              <span className="shortcut-title">{t(command.title)}</span>
              {isCustomised(command.id) && (
                <button className="text-button" title={t('Back to the default shortcut')} onClick={() => resetShortcut(command.id)}>
                  {t('Reset')}
                </button>
              )}
              <button
                className={`palette-keys${recording === command.id ? ' recording' : ''}`}
                onClick={() => {
                  setTyped('')
                  setRecording(recording === command.id ? null : command.id)
                }}
                onKeyDown={(e) => recording === command.id && record(e, command.id)}
                onBlur={() => {
                  if (recording === command.id) {
                    setTyped('')
                    setRecording(null)
                  }
                }}
              >
                {recording === command.id ? typed || t('Press keys…') : keys.length > 0 ? keys.map(formatKey).join('  ') : t('Set shortcut')}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

/** The pages of the preferences, in the order of the list on the left. */
const PAGES: [id: string, title: string, icon: LucideIcon, page: () => React.ReactNode][] = [
  ['general', msg('General'), Settings2, GeneralSettings],
  ['drawing', msg('Drawing'), PencilRuler, DrawingSettings],
  ['ai', msg('AI'), Bot, AiSettings],
  ['shortcuts', msg('Keyboard shortcuts'), Keyboard, ShortcutSettings],
  ['extensions', msg('Extensions'), Puzzle, ExtensionWarehouse],
]

/** The app's settings: a list of pages on the left, the chosen page on the right. */
export function Preferences() {
  const open = useWindows((s) => s.preferencesOpen)
  const asked = useWindows((s) => s.preferencesPage)
  const [current, setCurrent] = useState(PAGES[0][0])
  // A command that opens Preferences on a given page (Extensions…) says which, once.
  useEffect(() => {
    if (!asked) return
    setCurrent(asked)
    useWindows.setState({ preferencesPage: null })
  }, [asked])
  if (!open) return null
  const [, title, , Page] = PAGES.find(([id]) => id === current) ?? PAGES[0]

  return (
    <div className="palette-backdrop" onMouseDown={close} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="dialog prefs" role="dialog" aria-label={t('Preferences')} onMouseDown={(e) => e.stopPropagation()}>
        <nav className="prefs-nav" aria-label={t('Preferences')}>
          <h2>{t('Preferences')}</h2>
          {PAGES.map(([id, name, Icon]) => (
            <button key={id} className={id === current ? 'active' : ''} aria-current={id === current ? 'page' : undefined} onClick={() => setCurrent(id)}>
              <Icon size={15} />
              {t(name)}
            </button>
          ))}
        </nav>
        <div className="prefs-page">
          <header>
            <h2>{t(title)}</h2>
            <button className="text-button" onClick={close}>
              {t('Done')}
            </button>
          </header>
          <div className="prefs-content">
            <Page />
          </div>
        </div>
      </div>
    </div>
  )
}
