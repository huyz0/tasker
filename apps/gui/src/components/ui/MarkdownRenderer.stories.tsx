import type { Meta, StoryObj } from '@storybook/react-vite';
import { MarkdownRenderer } from './MarkdownRenderer';

const meta = {
  title: 'UI/MarkdownRenderer',
  component: MarkdownRenderer,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarkdownRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    content: `
# Heading 1
## Heading 2

This is a paragraph with **bold** and *italic* text.

### Code
Inline \`code\` blocks and multiline code:
\`\`\`javascript
const foo = "bar";
console.log(foo);
\`\`\`

### Lists
- Item 1
- Item 2
  - Subitem A

> Blockquotes are also fully supported.

[Link to Google](https://google.com)
    `,
  },
};

export const XSSProtection: Story = {
  args: {
    content: `
This markdown tests XSS protection:

<script>alert("You have been hacked")</script>

Click this [malicious link](javascript:alert("XSS"))

<iframe src="javascript:alert(1)"></iframe>

Safe HTML is preserved: <b>Bold HTML Tag</b>
    `,
  },
};
