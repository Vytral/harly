/**
 * Settings section icons — Phosphor duotone (via better-icons / Iconify).
 * Duotone: a low-opacity base layer + a solid currentColor layer, so they read
 * as two-tone when colored (e.g. the active pine nav item). Sized via className.
 */

type IconProps = { className?: string };

export function BuildingsIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      className={className}
      aria-hidden="true"
    >
      <g fill="currentColor">
        <path
          d="M136 32v184H40V85.35a8 8 0 0 1 3.56-6.66l80-53.33A8 8 0 0 1 136 32"
          opacity=".2"
        />
        <path d="M240 208h-16V96a16 16 0 0 0-16-16h-64V32a16 16 0 0 0-24.88-13.32L39.12 72A16 16 0 0 0 32 85.34V208H16a8 8 0 0 0 0 16h224a8 8 0 0 0 0-16M208 96v112h-64V96ZM48 85.34L128 32v176H48ZM112 112v16a8 8 0 0 1-16 0v-16a8 8 0 1 1 16 0m-32 0v16a8 8 0 0 1-16 0v-16a8 8 0 1 1 16 0m0 56v16a8 8 0 0 1-16 0v-16a8 8 0 0 1 16 0m32 0v16a8 8 0 0 1-16 0v-16a8 8 0 0 1 16 0" />
      </g>
    </svg>
  );
}

export function UsersThreeIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      className={className}
      aria-hidden="true"
    >
      <g fill="currentColor">
        <path
          d="M168 144a40 40 0 1 1-40-40a40 40 0 0 1 40 40M64 56a32 32 0 1 0 32 32a32 32 0 0 0-32-32m128 0a32 32 0 1 0 32 32a32 32 0 0 0-32-32"
          opacity=".2"
        />
        <path d="M244.8 150.4a8 8 0 0 1-11.2-1.6A51.6 51.6 0 0 0 192 128a8 8 0 0 1 0-16a24 24 0 1 0-23.24-30a8 8 0 1 1-15.5-4A40 40 0 1 1 219 117.51a67.94 67.94 0 0 1 27.43 21.68a8 8 0 0 1-1.63 11.21M190.92 212a8 8 0 1 1-13.85 8a57 57 0 0 0-98.15 0a8 8 0 1 1-13.84-8a72.06 72.06 0 0 1 33.74-29.92a48 48 0 1 1 58.36 0A72.06 72.06 0 0 1 190.92 212M128 176a32 32 0 1 0-32-32a32 32 0 0 0 32 32m-56-56a8 8 0 0 0-8-8a24 24 0 1 1 23.24-30a8 8 0 1 0 15.5-4A40 40 0 1 0 37 117.51a67.94 67.94 0 0 0-27.4 21.68a8 8 0 1 0 12.8 9.61A51.6 51.6 0 0 1 64 128a8 8 0 0 0 8-8" />
      </g>
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      className={className}
      aria-hidden="true"
    >
      <g fill="currentColor">
        <path
          d="M216 56v56c0 96-88 120-88 120s-88-24-88-120V56a8 8 0 0 1 8-8h160a8 8 0 0 1 8 8"
          opacity=".2"
        />
        <path d="M208 40H48a16 16 0 0 0-16 16v56c0 52.72 25.52 84.67 46.93 102.19c23.06 18.86 46 25.26 47 25.53a8 8 0 0 0 4.2 0c1-.27 23.91-6.67 47-25.53C198.48 196.67 224 164.72 224 112V56a16 16 0 0 0-16-16m0 72c0 37.07-13.66 67.16-40.6 89.42a129.3 129.3 0 0 1-39.4 22.2a128.3 128.3 0 0 1-38.92-21.81C61.82 179.51 48 149.3 48 112V56h160ZM82.34 141.66a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 11.32l-56 56a8 8 0 0 1-11.32 0Z" />
      </g>
    </svg>
  );
}

export function PlugIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      className={className}
      aria-hidden="true"
    >
      <g fill="currentColor">
        <path
          d="m185 127l-58 58a24 24 0 0 1-33.94 0L71 162.91A24 24 0 0 1 71 129l58-58a24 24 0 0 1 33.94 0L185 93.09a24 24 0 0 1 0 33.91"
          opacity=".2"
        />
        <path d="M237.66 18.34a8 8 0 0 0-11.32 0l-52.4 52.41l-5.37-5.38a32.05 32.05 0 0 0-45.26 0L100 88.69l-6.34-6.35a8 8 0 0 0-11.32 11.32l6.35 6.34l-23.32 23.31a32 32 0 0 0 0 45.26l5.38 5.37l-52.41 52.4a8 8 0 0 0 11.32 11.32l52.4-52.41l5.37 5.38a32.06 32.06 0 0 0 45.26 0L156 167.31l6.34 6.35a8 8 0 0 0 11.32-11.32l-6.35-6.34l23.32-23.31a32 32 0 0 0 0-45.26l-5.38-5.37l52.41-52.4a8 8 0 0 0 0-11.32m-116.29 161a16 16 0 0 1-22.62 0l-22.06-22.09a16 16 0 0 1 0-22.62L100 111.31L144.69 156Zm57.94-57.94L156 144.69L111.31 100l23.32-23.31a16 16 0 0 1 22.62 0l22.06 22a16 16 0 0 1 0 22.63ZM88.57 35a8 8 0 0 1 14.86-6l8 20a8 8 0 0 1-14.86 6Zm-64 58A8 8 0 0 1 35 88.57l20 8a8 8 0 0 1-6 14.86l-20-8A8 8 0 0 1 24.57 93m206.86 70a8 8 0 0 1-10.4 4.46l-20-8a8 8 0 1 1 5.97-14.89l20 8a8 8 0 0 1 4.43 10.43m-64 58.06a8 8 0 0 1-14.86 5.94l-8-20a8 8 0 0 1 14.86-6Z" />
      </g>
    </svg>
  );
}

export function EnvelopeIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      className={className}
      aria-hidden="true"
    >
      <g fill="currentColor">
        <path
          d="M224 56v144a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8V56Z"
          opacity=".2"
        />
        <path d="M224 48H32a8 8 0 0 0-8 8v144a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V56a8 8 0 0 0-8-8m-8.42 16L128 133.15L40.42 64ZM216 200H40V74.19l82.59 75.71a8 8 0 0 0 10.82 0L216 74.19Z" />
      </g>
    </svg>
  );
}

export function SparkleIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      className={className}
      aria-hidden="true"
    >
      <g fill="currentColor">
        <path
          d="m194.82 151.43l-55.09 20.3l-20.3 55.09a7.92 7.92 0 0 1-14.86 0l-20.3-55.09l-55.09-20.3a7.92 7.92 0 0 1 0-14.86l55.09-20.3l20.3-55.09a7.92 7.92 0 0 1 14.86 0l20.3 55.09l55.09 20.3a7.92 7.92 0 0 1 0 14.86"
          opacity=".2"
        />
        <path d="M197.58 129.06L146 110l-19-51.62a15.92 15.92 0 0 0-29.88 0L78 110l-51.62 19a15.92 15.92 0 0 0 0 29.88L78 178l19 51.62a15.92 15.92 0 0 0 29.88 0L146 178l51.62-19a15.92 15.92 0 0 0 0-29.88ZM137 164.22a8 8 0 0 0-4.74 4.74L112 223.85L91.78 169a8 8 0 0 0-4.78-4.78L32.15 144L87 123.78a8 8 0 0 0 4.78-4.78L112 64.15L132.22 119a8 8 0 0 0 4.74 4.74L191.85 144ZM144 40a8 8 0 0 1 8-8h16V16a8 8 0 0 1 16 0v16h16a8 8 0 0 1 0 16h-16v16a8 8 0 0 1-16 0V48h-16a8 8 0 0 1-8-8m104 48a8 8 0 0 1-8 8h-8v8a8 8 0 0 1-16 0v-8h-8a8 8 0 0 1 0-16h8v-8a8 8 0 0 1 16 0v8h8a8 8 0 0 1 8 8" />
      </g>
    </svg>
  );
}
