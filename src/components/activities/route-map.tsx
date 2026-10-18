"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer } from "react-leaflet";

export type LatLon = { lat: number; lon: number };

/** OpenStreetMap tiles with the route and start/finish markers. Client-only (Leaflet needs `window`). */
export default function RouteMap({ points }: { points: readonly LatLon[] }) {
  const path = points.map((p) => [p.lat, p.lon] as [number, number]);
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
  const start = path[0];
  const end = path.at(-1);

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [16, 16] }}
      scrollWheelZoom={false}
      className="h-64 w-full rounded-lg"
      attributionControl
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <Polyline positions={path} pathOptions={{ color: "#2a78d6", weight: 4, opacity: 0.9 }} />
      {start ? <CircleMarker center={start} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#0ca30c", fillOpacity: 1 }} /> : null}
      {end ? <CircleMarker center={end} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#d03b3b", fillOpacity: 1 }} /> : null}
    </MapContainer>
  );
}
