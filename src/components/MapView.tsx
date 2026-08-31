import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng, Place, Poi } from '../types'
import { CATEGORY_EMOJI, CATEGORY_LABEL } from '../utils/poiDisplay'

const POI_COLOR: Record<Poi['category'], string> = {
  viewpoint: 'var(--green-deep, #1e7a4d)',
  'kosher-food': 'var(--sky-deep, #0288b7)',
  fuel: '#e65100',
}

function poiIcon(category: Poi['category']) {
  return L.divIcon({
    className: 'poi-marker',
    html: `<span style="background:${POI_COLOR[category]}" class="poi-marker-dot">${CATEGORY_EMOJI[category]}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })
}

const START_ICON = L.divIcon({
  className: 'endpoint-marker',
  html: `<span class="endpoint-marker-dot start">א</span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

const END_ICON = L.divIcon({
  className: 'endpoint-marker',
  html: `<span class="endpoint-marker-dot end">ב</span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

interface MapViewProps {
  start: Place | null
  end: Place | null
  route: LatLng[] | null
  pois: Poi[]
  focusedPoiId: string | null
}

function FitBounds({ route, start, end }: { route: LatLng[] | null; start: Place | null; end: Place | null }) {
  const map = useMap()

  useEffect(() => {
    if (route && route.length > 1) {
      const bounds = L.latLngBounds(route.map((p) => [p.lat, p.lng]))
      map.fitBounds(bounds, { padding: [40, 40] })
    } else if (start) {
      map.setView([start.lat, start.lng], 11)
    } else if (end) {
      map.setView([end.lat, end.lng], 11)
    }
  }, [route, start, end, map])

  return null
}

function FocusPoi({ pois, focusedPoiId }: { pois: Poi[]; focusedPoiId: string | null }) {
  const map = useMap()

  useEffect(() => {
    if (!focusedPoiId) return
    const poi = pois.find((p) => p.id === focusedPoiId)
    if (poi) map.setView([poi.lat, poi.lng], Math.max(map.getZoom(), 13), { animate: true })
  }, [focusedPoiId, pois, map])

  return null
}

export function MapView({ start, end, route, pois, focusedPoiId }: MapViewProps) {
  return (
    <MapContainer
      center={[31.5, 34.8]}
      zoom={7}
      className="map"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {route && route.length > 1 && (
        <Polyline positions={route.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#0288b7', weight: 5, opacity: 0.75 }} />
      )}

      {start && (
        <Marker position={[start.lat, start.lng]} icon={START_ICON}>
          <Popup>יציאה: {start.label}</Popup>
        </Marker>
      )}

      {end && (
        <Marker position={[end.lat, end.lng]} icon={END_ICON}>
          <Popup>יעד: {end.label}</Popup>
        </Marker>
      )}

      {pois.map((poi) => (
        <Marker key={poi.id} position={[poi.lat, poi.lng]} icon={poiIcon(poi.category)}>
          <Popup>
            <strong>{poi.name}</strong>
            <br />
            {CATEGORY_LABEL[poi.category]}
            <br />
            כ-{poi.distanceFromRoute.toFixed(1)} ק"מ מהמסלול
            {poi.address && (
              <>
                <br />
                {poi.address}
              </>
            )}
            {poi.openingHours && (
              <>
                <br />
                שעות פעילות: {poi.openingHours}
              </>
            )}
            {poi.phone && (
              <>
                <br />
                טלפון: <a href={`tel:${poi.phone}`}>{poi.phone}</a>
              </>
            )}
          </Popup>
        </Marker>
      ))}

      <FitBounds route={route} start={start} end={end} />
      <FocusPoi pois={pois} focusedPoiId={focusedPoiId} />
    </MapContainer>
  )
}
