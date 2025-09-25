declare module 'react-leaflet-cluster' {
  import type { PropsWithChildren, ComponentType } from 'react';
  import type { MarkerClusterGroupOptions } from 'leaflet';

  type ClusterProps = PropsWithChildren<
    MarkerClusterGroupOptions & {
      chunkedLoading?: boolean;
      removeOutsideVisibleBounds?: boolean;
      maxClusterRadius?: number;
      spiderfyOnMaxZoom?: boolean;
      disableClusteringAtZoom?: number;
    }
  >;

  const MarkerClusterGroup: ComponentType<ClusterProps>;
  export default MarkerClusterGroup;
}

