import { cn } from '@/lib/cn'

export function Section({ title, desc, children, className }: { title: string; desc?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-line bg-bg/60 p-5', className)}>
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 [&+&]:border-t [&+&]:border-line">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{title}</div>
        {desc && <div className="mt-0.5 text-xs text-muted">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
