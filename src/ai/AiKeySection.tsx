// Settings › AI: the user's own Anthropic API key, kept only in this browser.
import { useState } from 'react'
import { Button, Checkbox, FlexRow, LabeledInput, Text, TextInput } from '@epam/uui'
import { clearKey, explain, getKey, isRemembered, setKey, testKey, AiError } from './client'

export function AiKeySection({ notify }: { notify: (m: string, ok?: boolean) => void }) {
  const [has, setHas] = useState(!!getKey())
  const [val, setVal] = useState('')
  const [remember, setRemember] = useState(has ? isRemembered() : true)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await testKey(val.trim())
      setKey(val.trim(), remember); setVal(''); setHas(true)
      notify('Key works and is saved' + (remember ? ' on this computer' : ' for this tab only'))
    } catch (e) { notify(explain(e instanceof AiError ? e.kind : 'other'), false) }
    finally { setBusy(false) }
  }
  return (
    <div className="ai-key">
      <Text fontSize="16" fontWeight="600">AI (Claude)</Text>
      <Text color="secondary" fontSize="14">
        The AI button sends your text and files, plus this project's requirements, to Anthropic (Claude) to propose requirements. Each run is billed to your own API key.
      </Text>
      <Text fontSize="14">Status: <b>{has ? `key saved ${isRemembered() ? 'on this computer' : 'for this tab only'}` : 'no key'}</b></Text>
      <LabeledInput label={has ? 'Replace key' : 'Anthropic API key'}>
        <TextInput type="password" value={val} onValueChange={v => setVal(v ?? '')} placeholder="sk-ant-…" />
      </LabeledInput>
      <Checkbox label="Remember key on this computer (otherwise only until this tab is closed)" value={remember} onValueChange={setRemember} />
      <FlexRow columnGap="12">
        <Button color="primary" caption={busy ? 'Checking…' : 'Save key'} isDisabled={!val.trim() || busy} onClick={save} />
        {has && <Button fill="outline" color="secondary" caption="Remove key" onClick={() => { clearKey(); setHas(false); notify('Key removed') }} />}
      </FlexRow>
      <Text color="secondary" fontSize="12">
        Stored only in this browser. Not saved to the project or Drive. Create a key at{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>; a separate key with a monthly spend limit is safest.
      </Text>
    </div>
  )
}
