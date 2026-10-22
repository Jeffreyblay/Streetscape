// Who built the platform, and the institutions behind it.
const PARTNERS = [
  { src: '/logos/nsf.png', alt: 'National Science Foundation', className: 'wide' },
  { src: '/logos/nasa.png', alt: 'NASA' },
  { src: '/logos/noaa.png', alt: 'National Oceanic and Atmospheric Administration' },
]

export default function Acknowledgement() {
  return (
    <section className="ack">
      <h2>Acknowledgement</h2>
      <p className="ack-author">
        Developed by <strong>Dr. Jeffrey Blay</strong>
      </p>
      <p className="ack-caption">Partners and institutions</p>
      {/* Logos sit on white: several carry dark lettering that would vanish on the dark panel */}
      <div className="ack-logos">
        <div className="ack-row">
          {PARTNERS.map((p) => (
            <img key={p.src} src={p.src} alt={p.alt} title={p.alt} className={p.className} />
          ))}
        </div>
        <img
          className="ack-host"
          src="/logos/ncat.png"
          alt="North Carolina Agricultural and Technical State University"
          title="North Carolina Agricultural and Technical State University"
        />
      </div>
    </section>
  )
}
