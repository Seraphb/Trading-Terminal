import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PumpSignalScanner from '@/components/scanner/PumpSignalScanner';

export default function PumpSignals() {
  const navigate = useNavigate();

  const handleOpenSymbol = (symbol, mode) => {
    if (mode === 'stock') {
      localStorage.setItem('stockSymbol', symbol.toUpperCase());
      navigate(createPageUrl('Stocks'));
    } else {
      localStorage.setItem('terminalSymbol', symbol.toUpperCase());
      navigate(createPageUrl('Terminal'));
    }
  };

  return (
    <div className="h-full">
      <PumpSignalScanner onOpenSymbol={handleOpenSymbol} />
    </div>
  );
}
