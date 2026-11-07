import * as React from 'react';
import { type ClassValue } from 'clsx';
export declare function cn(...inputs: ClassValue[]): string;
export declare const themeTokens: {
    colors: {
        primary: {
            DEFAULT: string;
            hover: string;
            light: string;
        };
        accent: {
            DEFAULT: string;
            hover: string;
            light: string;
        };
        success: string;
        warning: string;
        danger: string;
        dark: string;
    };
    typography: {
        fontFamily: string;
    };
};
export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    isLoading?: boolean;
}
export declare const Button: React.FC<ButtonProps>;
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    hoverEffect?: boolean;
}
export declare const Card: React.FC<CardProps>;
export type BadgeVariant = 'info' | 'success' | 'warning' | 'danger' | 'amber';
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
}
export declare const Badge: React.FC<BadgeProps>;
