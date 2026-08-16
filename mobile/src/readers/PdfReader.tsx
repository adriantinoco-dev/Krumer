import React from 'react';
import { useWindowDimensions } from 'react-native';

export function PdfReader({
  filePath,
  initialPage = 1,
  onPageChange,
}: {
  filePath: string;
  initialPage?: number;
  onPageChange?: (page: number, total: number) => void;
}) {
  const { width, height } = useWindowDimensions();
  const Pdf = require('react-native-pdf').default ?? require('react-native-pdf');

  return (
    <Pdf
      source={{ uri: filePath, cache: true }}
      page={initialPage}
      onPageChanged={onPageChange}
      onError={() => undefined}
      style={{ flex: 1, height, width }}
      enablePaging
      horizontal={false}
      fitPolicy={0}
    />
  );
}
