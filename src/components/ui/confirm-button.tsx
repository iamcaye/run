"use client";

import type { ComponentProps } from "react";
import { SubmitButton } from "./form";

/** A submit button that asks for confirmation first. Use inside a `<form action={…}>`. */
export function ConfirmSubmitButton({
  confirmMessage,
  ...props
}: ComponentProps<typeof SubmitButton> & { confirmMessage: string }) {
  return (
    <SubmitButton
      {...props}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    />
  );
}
