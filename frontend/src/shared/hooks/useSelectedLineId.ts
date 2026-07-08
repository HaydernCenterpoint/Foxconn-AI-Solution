import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ProductionLine } from '../types/domain';

export function useSelectedLineId(lines?: ProductionLine[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const lineIdFromUrl = searchParams.get('lineId') ?? '';

  const selectedLineId = useMemo(() => {
    if (lineIdFromUrl && lines?.some((line) => line.id === lineIdFromUrl)) return lineIdFromUrl;
    return lines?.[0]?.id ?? '';
  }, [lineIdFromUrl, lines]);

  const setSelectedLineId = (lineId: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (lineId) next.set('lineId', lineId);
      else next.delete('lineId');
      return next;
    });
  };

  return { selectedLineId, setSelectedLineId };
}
