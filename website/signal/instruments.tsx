type TraceProps = {
  samples: readonly number[];
  events?: readonly number[];
};

function stepPath(values: readonly number[], top: number, bottom: number) {
  const max = Math.max(2, ...values);
  const points = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const width = 210 / points.length;
  const y = (value: number) => bottom - (value / max) * (bottom - top);
  let path = `M 8 ${y(points[0] ?? 0)}`;
  for (let i = 1; i < points.length; i++) {
    path += ` H ${8 + i * width} V ${y(points[i] ?? 0)}`;
  }
  return `${path} H 218`;
}

// The plot is a live data visualization layered on the photographed glass.
export function SignalTrace({samples, events}: TraceProps) {
  return (
    <svg
      className="signal-trace"
      viewBox="0 0 226 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className="count-trace"
        d={stepPath(samples, 14, events ? 76 : 84)}
      />
      {events && (
        <path
          className="event-trace"
          d={stepPath(
            events.flatMap((event) => [0, event]),
            66,
            94,
          )}
        />
      )}
    </svg>
  );
}

export function BenchScope({
  src,
  samples,
  events,
  value,
  label = 'Count',
}: TraceProps & {src: string; value: number; label?: string}) {
  return (
    <div className="bench-scope">
      <img width={1536} height={1024} src={src} alt="" fetchPriority="high" />
      <div className="scope-glass">
        <span className="scope-readout">
          {label} <strong>{value}</strong>
        </span>
        <SignalTrace samples={samples} events={events} />
      </div>
    </div>
  );
}

export function RackStrip({src}: {src: string}) {
  return (
    <div className="rack-strip" aria-hidden="true">
      <img width={1440} height={203} src={src} alt="" />
    </div>
  );
}
