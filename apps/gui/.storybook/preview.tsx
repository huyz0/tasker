import type { Preview } from '@storybook/react-vite'
import '../src/index.css';
import { BrowserRouter } from 'react-router-dom';

const preview: Preview = {
  decorators: [
    (Story) => (
      <BrowserRouter>
        <Story />
      </BrowserRouter>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      //
      // `error`, because `todo` is indistinguishable from `off` to anyone who
      // does not open the Storybook UI: violations were reported to a panel
      // nobody was watching, and no run ever failed because of one. Every story
      // now runs axe in a real browser under `moon run gui:storybook-test`
      // (M06-T13).
      test: 'error'
    }
  },
};

export default preview;