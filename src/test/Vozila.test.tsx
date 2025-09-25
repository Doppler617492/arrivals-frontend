// @ts-nocheck
import { render } from '@testing-library/react';
import React from 'react';
import VozilaPage from '../pages/Vozila';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }: any) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  Tooltip: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
  Polyline: () => <div data-testid="polyline" />,
  useMap: () => ({ fitBounds: () => {} }),
}));

vi.mock('react-leaflet-cluster', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="cluster">{children}</div>,
}));

test('renders Vozila header', () => {
  const { getByText } = render(<VozilaPage />);
  expect(getByText('Vozila')).toBeTruthy();
});
