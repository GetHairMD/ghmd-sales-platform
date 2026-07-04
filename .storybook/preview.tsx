import type { Preview } from '@storybook/nextjs-vite'
import { DM_Sans, Poppins, Cardo, Source_Code_Pro } from 'next/font/google'
import '../src/app/globals.css'

// Mirror the app's next/font setup (layout.tsx) so token font vars resolve in Storybook.
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-dm-sans', display: 'swap' })
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-poppins', display: 'swap' })
const cardo = Cardo({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-cardo', display: 'swap' })
const sourceCodePro = Source_Code_Pro({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-source-code-pro', display: 'swap' })

const fontVars = `${dmSans.variable} ${poppins.variable} ${cardo.variable} ${sourceCodePro.variable}`

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      test: 'todo',
    },
    backgrounds: {
      options: {
        app: { name: 'App (white)', value: '#FFFFFF' },
        mist: { name: 'Mist', value: '#F2F2F2' },
        dark: { name: 'Dark', value: '#040404' },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'app' },
  },
  decorators: [
    (Story) => (
      <div className={`${fontVars} font-body text-text`}>
        <Story />
      </div>
    ),
  ],
}

export default preview
