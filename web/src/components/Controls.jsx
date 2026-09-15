function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className={`toggle ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export default function Controls({ layers, onChange }) {
  const set = (key) => (value) => onChange({ ...layers, [key]: value })
  return (
    <section>
      <h2>Layers</h2>
      <Toggle label="3D water surface" checked={layers.showWater} onChange={set('showWater')} />
      <Toggle
        label="Animate water"
        checked={layers.animateWater}
        onChange={set('animateWater')}
        disabled={!layers.showWater}
      />
      <Toggle label="Depth colours" checked={layers.showDepthColors} onChange={set('showDepthColors')} />
    </section>
  )
}
