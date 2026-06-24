'use client';

import { InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  containerClassName?: string;
}

export function SearchInput({ className, containerClassName, ...props }: SearchInputProps) {
  return (
    <div className={cn("search-bar", containerClassName)}>
      <Search className="w-4 h-4" />
      <input
        type="search"
        className={cn(className)}
        {...props}
      />
    </div>
  );
}
