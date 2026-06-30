import Image from "next/image";

export function AppHeader() {
  return (
    <header className="border-b border-brand-line/70 bg-porcelain/88 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-12 w-[184px] shrink-0 items-center rounded-md bg-brand-black px-3 shadow-sm sm:w-[220px]">
            <Image
              src="/brand/mkjewels-logo-dark.jpeg"
              alt="MK Jewels"
              width={1600}
              height={400}
              priority
              className="h-8 w-full object-contain"
            />
          </div>
          <div className="hidden sm:block">
            <p className="font-serif text-xl leading-none text-charcoal">Story Studio</p>
            <p className="mt-1 text-xs text-ink/60">Internal story workspace</p>
          </div>
        </div>

        <p className="hidden rounded-md border border-brand-line bg-white px-4 py-2 text-sm font-semibold text-ink/72 sm:block">
          Private staff tool
        </p>
      </div>
    </header>
  );
}
