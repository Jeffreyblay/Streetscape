// One labelled on/off checkbox.
function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className={`toggle ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

// The Layers panel: base map choice, the layer switches and the replay button.
export default function Controls({ layers, onChange, basemap, onBasemapChange, basemaps }) {
  const set = (key) => (value) => onChange({ ...layers, [key]: value })
  return (
    <section>
      <h2>Map layers</h2>
      <label className="select">
        <span>Base map</span>
        <select value={basemap} onChange={(e) => onBasemapChange(e.target.value)}>
          {Object.entries(basemaps).map(([key, b]) => (
            <option key={key} value={key}>{b.label}</option>
          ))}
        </select>
      </label>
      <Toggle label="3D water surface" checked={layers.showWater} onChange={set('showWater')} />
      <Toggle
        label="Animate water"
        checked={layers.animateWater}
        onChange={set('animateWater')}
        disabled={!layers.showWater}
      />
      <Toggle
        label="Colour water by depth"
        checked={layers.colorWaterByDepth}
        onChange={set('colorWaterByDepth')}
        disabled={!layers.showWater}
      />
      <Toggle label="Depth colours on ground" checked={layers.showDepthColors} onChange={set('showDepthColors')} />
      <Toggle
        label="Water mark on buildings"
        checked={layers.showWaterMarks}
        onChange={set('showWaterMarks')}
      />
    </section>
  )
}
