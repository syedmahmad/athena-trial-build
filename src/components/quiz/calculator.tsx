"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type CalcState = {
  display: string;
  operand: number | null;
  operator: string | null;
  waitingForOperand: boolean;
};

const initial: CalcState = {
  display: "0",
  operand: null,
  operator: null,
  waitingForOperand: false,
};

function compute(left: number, op: string, right: number): number {
  switch (op) {
    case "+": return left + right;
    case "-": return left - right;
    case "×": return left * right;
    case "÷": return right !== 0 ? left / right : NaN;
    case "^": return Math.pow(left, right);
    default: return right;
  }
}

export function Calculator() {
  const [state, setState] = useState<CalcState>(initial);

  const inputDigit = useCallback((digit: string) => {
    setState((s) => {
      if (s.waitingForOperand) {
        return { ...s, display: digit, waitingForOperand: false };
      }
      return { ...s, display: s.display === "0" ? digit : s.display + digit };
    });
  }, []);

  const inputDot = useCallback(() => {
    setState((s) => {
      if (s.waitingForOperand) {
        return { ...s, display: "0.", waitingForOperand: false };
      }
      if (s.display.includes(".")) return s;
      return { ...s, display: s.display + "." };
    });
  }, []);

  const clear = useCallback(() => setState(initial), []);

  const toggleSign = useCallback(() => {
    setState((s) => ({
      ...s,
      display: s.display.startsWith("-")
        ? s.display.slice(1)
        : s.display === "0"
          ? "0"
          : "-" + s.display,
    }));
  }, []);

  const percent = useCallback(() => {
    setState((s) => ({
      ...s,
      display: String(parseFloat(s.display) / 100),
    }));
  }, []);

  const handleOperator = useCallback((nextOp: string) => {
    setState((s) => {
      const current = parseFloat(s.display);
      if (s.operator && !s.waitingForOperand && s.operand !== null) {
        const result = compute(s.operand, s.operator, current);
        return {
          display: String(result),
          operand: result,
          operator: nextOp,
          waitingForOperand: true,
        };
      }
      return {
        ...s,
        operand: current,
        operator: nextOp,
        waitingForOperand: true,
      };
    });
  }, []);

  const handleEquals = useCallback(() => {
    setState((s) => {
      if (s.operator === null || s.operand === null) return s;
      const current = parseFloat(s.display);
      const result = compute(s.operand, s.operator, current);
      return {
        display: String(result),
        operand: null,
        operator: null,
        waitingForOperand: true,
      };
    });
  }, []);

  const handleUnary = useCallback((fn: string) => {
    setState((s) => {
      const val = parseFloat(s.display);
      let result: number;
      switch (fn) {
        case "sin": result = Math.sin(val); break;
        case "cos": result = Math.cos(val); break;
        case "tan": result = Math.tan(val); break;
        case "√": result = Math.sqrt(val); break;
        default: return s;
      }
      return { ...s, display: String(result), waitingForOperand: true };
    });
  }, []);

  const insertPi = useCallback(() => {
    setState((s) => ({
      ...s,
      display: String(Math.PI),
      waitingForOperand: true,
    }));
  }, []);

  const formatDisplay = (d: string) => {
    const num = parseFloat(d);
    if (isNaN(num)) return "Error";
    if (d.endsWith(".") || d.endsWith(".0")) return d;
    if (d.length > 12) return num.toPrecision(10);
    return d;
  };

  const Btn = ({
    label,
    onClick,
    className,
    span,
  }: {
    label: string;
    onClick: () => void;
    className?: string;
    span?: number;
  }) => (
    <button
      onClick={onClick}
      className={cn(
        "flex h-10 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent/80 active:scale-95",
        "bg-card border",
        span === 2 && "col-span-2",
        className
      )}
    >
      {label}
    </button>
  );

  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="fixed bottom-20 right-6 z-[60] w-72 rounded-xl border bg-background shadow-xl"
    >
      <div className="flex cursor-grab items-center justify-center border-b py-1.5 active:cursor-grabbing">
        <GripHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="p-3">
        {/* Display */}
        <div className="mb-3 rounded-md bg-muted px-3 py-2 text-right font-mono text-xl tabular-nums">
          {formatDisplay(state.display)}
        </div>

        {/* Scientific row */}
        <div className="mb-2 grid grid-cols-6 gap-1">
          <Btn label="sin" onClick={() => handleUnary("sin")} className="text-xs" />
          <Btn label="cos" onClick={() => handleUnary("cos")} className="text-xs" />
          <Btn label="tan" onClick={() => handleUnary("tan")} className="text-xs" />
          <Btn label="√" onClick={() => handleUnary("√")} />
          <Btn label="^" onClick={() => handleOperator("^")} />
          <Btn label="π" onClick={insertPi} />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-4 gap-1">
          <Btn label="C" onClick={clear} className="bg-destructive/10 text-destructive" />
          <Btn label="+/-" onClick={toggleSign} />
          <Btn label="%" onClick={percent} />
          <Btn label="÷" onClick={() => handleOperator("÷")} className="bg-primary/10 text-primary" />

          <Btn label="7" onClick={() => inputDigit("7")} />
          <Btn label="8" onClick={() => inputDigit("8")} />
          <Btn label="9" onClick={() => inputDigit("9")} />
          <Btn label="×" onClick={() => handleOperator("×")} className="bg-primary/10 text-primary" />

          <Btn label="4" onClick={() => inputDigit("4")} />
          <Btn label="5" onClick={() => inputDigit("5")} />
          <Btn label="6" onClick={() => inputDigit("6")} />
          <Btn label="-" onClick={() => handleOperator("-")} className="bg-primary/10 text-primary" />

          <Btn label="1" onClick={() => inputDigit("1")} />
          <Btn label="2" onClick={() => inputDigit("2")} />
          <Btn label="3" onClick={() => inputDigit("3")} />
          <Btn label="+" onClick={() => handleOperator("+")} className="bg-primary/10 text-primary" />

          <Btn label="0" onClick={() => inputDigit("0")} span={2} />
          <Btn label="." onClick={inputDot} />
          <Btn label="=" onClick={handleEquals} className="bg-primary text-primary-foreground" />
        </div>
      </div>
    </motion.div>
  );
}
