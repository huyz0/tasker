import React from 'react';
export const Card = ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>;
export const CardHeader = ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>;
export const CardTitle = ({ children, ...props }: React.ComponentProps<"h3">) => <h3 {...props}>{children}</h3>;
export const CardContent = ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>;
