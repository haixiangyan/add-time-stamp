'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Maximize2, Minimize2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface RecenterProps {
  lat: number;
  lng: number;
}
function Recenter({ lat, lng }: RecenterProps) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

interface InvalidateSizeProps {
  trigger: unknown;
}
function InvalidateSize({ trigger }: InvalidateSizeProps) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
  }, [trigger, map]);
  return null;
}

interface GpsMapProps {
  latitude: number;
  longitude: number;
}

export function GpsMap({ latitude, longitude }: GpsMapProps) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-50 bg-background'
          : 'relative h-40 w-full'
      }
    >
      <MapContainer
        center={[latitude, longitude]}
        zoom={13}
        scrollWheelZoom={fullscreen}
        style={{ height: '100%', width: '100%' }}
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />
        <Marker position={[latitude, longitude]}>
          <Popup>
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </Popup>
        </Marker>
        <Recenter lat={latitude} lng={longitude} />
        <InvalidateSize trigger={fullscreen} />
      </MapContainer>
      <button
        type="button"
        onClick={() => setFullscreen((v) => !v)}
        className="absolute right-2 top-2 z-[1000] flex size-8 items-center justify-center rounded-md bg-white/90 text-black shadow hover:bg-white"
        aria-label={fullscreen ? '退出全屏' : '全屏'}
      >
        {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>
    </div>
  );
}
