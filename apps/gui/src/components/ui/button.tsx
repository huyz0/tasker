import React from 'react';
export const Button = ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button>;
