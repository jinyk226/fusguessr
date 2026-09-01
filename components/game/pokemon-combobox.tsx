"use client";

import * as React from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface PokemonOption {
  id: number;
  name: string;
  spriteUrl: string;
}

interface PokemonComboboxProps {
  options: PokemonOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  label: string;
}

/** Capitalises a dex name for display; the data is stored lowercase. */
export function displayName(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const DisplayName = ({ name }: { name: string }) => (<>displayName(name)</>);

/**
 * Searchable picker over the full 386-entry dex.
 *
 * Rendering every option at once is fine here - cmdk filters in place and the
 * list is small enough that virtualising it would be more complexity than it
 * saves.
 */
export function PokemonCombobox({
  options,
  value,
  onChange,
  placeholder = "Pick a Pokemon",
  disabled,
  label,
}: PokemonComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          className="h-11 w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.spriteUrl}
                  alt=""
                  className="pixelated size-6"
                />
                {displayName(selected.name)}
              </>
            ) : (
              <span className="text-[var(--muted-foreground)]">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search the dex..." />
          <CommandList>
            <CommandEmpty>No Pokemon found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  onSelect={() => {
                    onChange(option.id === value ? null : option.id);
                    setOpen(false);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={option.spriteUrl} alt="" className="pixelated size-6" />
                  <span className="flex-1">{displayName(option.name)}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    #{String(option.id).padStart(3, "0")}
                  </span>
                  <CheckIcon
                    className={cn(
                      "size-4",
                      option.id === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
