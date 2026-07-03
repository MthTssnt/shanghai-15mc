import React, { useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { HexagonLayer } from '@deck.gl/aggregation-layers'; 
import Map from 'react-map-gl/maplibre'; 
import 'maplibre-gl/dist/maplibre-gl.css';

const INITIAL_VIEW_STATE = { longitude: 121.4737, latitude: 31.2304, zoom: 9.5, pitch: 0, bearing: 0 };

const BESOINS_BASELINE = ['Supplying', 'Caring', 'Learning', 'Enjoying'];
const BESOINS_SPORT = ['Public Park', 'Fresh Market', 'Gym & Fitness', 'Sports Field & Courts', 'Swimming Pool', 'Yoga, Martial Arts & Dance'];

export default function App() {
  const [hexData, setHexData] = useState([]);
  const [mode, setMode] = useState('base'); 
  const [transport, setTransport] = useState('walk'); 
  const [selectedSports, setSelectedSports] = useState(BESOINS_SPORT); 
  
  // États pour la recherche et la logique Sport
  const [sportMatchMode, setSportMatchMode] = useState('all'); // 'all' ou 'any'
  const [searchQuery, setSearchQuery] = useState('');
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

  // Nouveaux états pour les modales d'explication
  const [showTransparency, setShowTransparency] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    fetch('/shanghai_15min_grid.geojson')
      .then(res => res.json())
      .then(data => {
        const parseCats = (str) => (str || "").split('|').map(c => c.trim()).filter(c => c.length > 0);

        const points = data.features.map(feature => {
          const coords = feature.geometry.coordinates[0];
          let lng = 0, lat = 0;
          coords.forEach(c => { lng += c[0]; lat += c[1]; });
          lng /= coords.length; lat /= coords.length;

          const p = feature.properties;
          return {
            position: [lng, lat],
            walk: { base: parseCats(p.walk_base), sport: parseCats(p.walk_sport) },
            bike: { base: parseCats(p.bike_base), sport: parseCats(p.bike_sport) },
            drive: { base: parseCats(p.drive_base), sport: parseCats(p.drive_sport) }
          };
        });
        setHexData(points);
      });
  }, []);

  const toggleSport = (sport) => {
    setSelectedSports(prev => prev.includes(sport) ? prev.filter(s => s !== sport) : [...prev, sport]);
  };

  // Fonction de recherche d'adresse via OpenStreetMap (Nominatim)
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery) return;
    
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery + ', Shanghai')}&format=json&limit=1`);
      const data = await res.json();
      
      if (data && data.length > 0) {
        setViewState({
          ...viewState,
          longitude: parseFloat(data[0].lon),
          latitude: parseFloat(data[0].lat),
          zoom: 14, 
          transitionDuration: 1500 
        });
      } else {
        alert("Address not found in Shanghai. Try a different spelling.");
      }
    } catch (err) {
      console.error("Geocoding error:", err);
    }
  };

  const layers = [
    new HexagonLayer({
      id: 'dynamic-honeycomb-layer',
      data: hexData,
      pickable: true,
      extruded: false, 
      radius: 400, 
      coverage: 0.85, 
      opacity: 0.6, 
      getPosition: d => d.position,
      
      getColorValue: points => {
        let totalScore = 0;
        points.forEach(p => {
          const activeArray = p[transport][mode];
          let score = 0;
          
          if (mode === 'base') {
            score = activeArray.length / BESOINS_BASELINE.length;
          } else {
            if (selectedSports.length > 0) {
              const count = selectedSports.filter(s => activeArray.includes(s)).length;
              
              if (sportMatchMode === 'any') {
                score = count > 0 ? 1 : 0; 
              } else {
                score = count / selectedSports.length; 
              }
            }
          }
          totalScore += Math.min(score, 1.0);
        });
        return totalScore / points.length; 
      },
      
      colorDomain: [0, 1],
      colorRange: [[215, 48, 39, 255], [244, 109, 67, 255], [253, 174, 97, 255], [166, 217, 106, 255], [26, 152, 80, 255]],
      updateTriggers: { getColorValue: [mode, selectedSports, transport, sportMatchMode] }, 
      autoHighlight: true,
    })
  ];

  const getTooltipContent = ({object}) => {
    if (!object) return null;
    const percentage = Math.round(object.colorValue * 100);

    const presentSet = new Set();
    object.points.forEach(p => {
      p[transport][mode].forEach(cat => presentSet.add(cat));
    });

    const listPresent = Array.from(presentSet);
    const targets = mode === 'base' ? BESOINS_BASELINE : selectedSports;
    const listMissing = targets.filter(need => !presentSet.has(need));

    return (
      `🎯 Access Score: ${percentage}%\n` +
      `--------------------------\n` +
      `✅ Present Categories:\n   ${listPresent.length > 0 ? listPresent.join('\n   ') : 'None'}\n\n` +
      `❌ Missing Categories:\n   ${listMissing.length > 0 ? listMissing.join('\n   ') : 'None (Complete!)'}`
    );
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <DeckGL 
        viewState={viewState} 
        onViewStateChange={e => setViewState(e.viewState)}
        controller={true} 
        layers={layers} 
        getTooltip={getTooltipContent}
      >
        <Map mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" />
      </DeckGL>

      {/* PANNEAU UI PRINCIPAL */}
      <div style={{
        position: 'absolute', top: 20, left: 20, background: 'white', color: '#333', 
        padding: '20px', borderRadius: '8px', zIndex: 1, fontFamily: 'sans-serif', 
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', width: '320px', maxHeight: '90vh', overflowY: 'auto'
      }}>
        <h2 style={{margin: '0 0 15px 0', fontSize: '20px', color: '#111'}}>Shanghai Spatial Explorer</h2>

        {/* BARRE DE RECHERCHE */}
        <form onSubmit={handleSearch} style={{ display: 'flex', marginBottom: '20px' }}>
          <input 
            type="text" 
            placeholder="Search an address..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px 0 0 4px', outline: 'none' }}
          />
          <button type="submit" style={{ padding: '8px 12px', background: '#3498DB', color: 'white', border: 'none', borderRadius: '0 4px 4px 0', cursor: 'pointer', fontWeight: 'bold' }}>
            Go
          </button>
        </form>

        {/* SÉLECTION DU TRANSPORT */}
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#666', fontWeight: 'bold' }}>Transport Mode (15 min):</label>
          <select 
            value={transport} 
            onChange={(e) => setTransport(e.target.value)}
            style={{ width: '100%', padding: '8px', background: '#f9f9f9', color: '#333', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', outline: 'none' }}
          >
            <option value="walk">🚶‍♂️ Walking (5.2 km/h)</option>
            <option value="bike">🚲 Cycling (13.0 km/h)</option>
            <option value="drive">🚗 Driving (24.3 km/h)</option>
          </select>
        </div>
        
        {/* SÉLECTION DU MODE (BASE vs SPORT) */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            onClick={() => setMode('base')}
            style={{ flex: 1, padding: '8px', cursor: 'pointer', background: mode === 'base' ? '#3498DB' : '#f0f0f0', color: mode === 'base' ? 'white' : '#333', border: 'none', borderRadius: '4px', fontWeight: mode === 'base' ? 'bold' : 'normal' }}
          >
            Basic Needs
          </button>
          <button 
            onClick={() => setMode('sport')}
            style={{ flex: 1, padding: '8px', cursor: 'pointer', background: mode === 'sport' ? '#E67E22' : '#f0f0f0', color: mode === 'sport' ? 'white' : '#333', border: 'none', borderRadius: '4px', fontWeight: mode === 'sport' ? 'bold' : 'normal' }}
          >
            Sport Track
          </button>
        </div>

        {/* FILTRES SPORT */}
        {mode === 'sport' && (
          <div style={{ marginBottom: '20px', background: '#fcfcfc', padding: '12px', borderRadius: '6px', border: '1px solid #eee' }}>
            
            {/* TOGGLE MUST HAVE ALL / CAN HAVE ANY */}
            <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
              <button 
                onClick={() => setSportMatchMode('all')}
                style={{ flex: 1, padding: '6px', fontSize: '12px', cursor: 'pointer', background: sportMatchMode === 'all' ? '#E67E22' : '#eee', color: sportMatchMode === 'all' ? 'white' : '#666', border: 'none', borderRadius: '4px', fontWeight: sportMatchMode === 'all' ? 'bold' : 'normal' }}
              >
                Must have ALL
              </button>
              <button 
                onClick={() => setSportMatchMode('any')}
                style={{ flex: 1, padding: '6px', fontSize: '12px', cursor: 'pointer', background: sportMatchMode === 'any' ? '#E67E22' : '#eee', color: sportMatchMode === 'any' ? 'white' : '#666', border: 'none', borderRadius: '4px', fontWeight: sportMatchMode === 'any' ? 'bold' : 'normal' }}
              >
                Can have ANY
              </button>
            </div>

            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#E67E22' }}>Required Facilities:</h3>
            {BESOINS_SPORT.map(sport => (
              <label key={sport} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={selectedSports.includes(sport)} 
                  onChange={() => toggleSport(sport)} 
                  style={{ marginRight: '8px', cursor: 'pointer' }} 
                />
                {sport}
              </label>
            ))}
          </div>
        )}
        
        {/* LÉGENDE */}
        <div style={{ fontSize: '13px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', color: '#555', fontWeight: 'bold' }}>
          <span>0% (Lacking)</span><span>100% (Complete)</span>
        </div>
        <div style={{ height: '12px', width: '100%', borderRadius: '6px', background: 'linear-gradient(to right, rgb(215,48,39), rgb(244,109,67), rgb(253,174,97), rgb(166,217,106), rgb(26,152,80))'}}></div>
        
        {/* NOUVEAUX BOUTONS D'INFORMATION */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
          <button 
            onClick={() => setShowAbout(true)} 
            style={{ flex: 1, padding: '8px', background: '#f8f9fa', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            📖 About Project
          </button>
          <button 
            onClick={() => setShowTransparency(true)} 
            style={{ flex: 1, padding: '8px', background: '#f8f9fa', color: '#2c3e50', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            📊 Data & Methods
          </button>
        </div>
      </div>

      {/* MODAL : ABOUT PROJECT */}
      {showAbout && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', 
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10
        }}>
          <div style={{
            background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', width: '500px', maxWidth: '90%', fontFamily: 'sans-serif'
          }}>
            <h2 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>About the 15-Minute City</h2>
            <p style={{ fontSize: '14px', color: '#555', lineHeight: '1.6', marginBottom: '15px' }}>
              The <strong>15-Minute City</strong> is an urban planning concept theorized by Carlos Moreno. The core idea is that residents should be able to access most of their daily necessities within a 15-minute walk or bike ride from their homes.
            </p>
            <p style={{ fontSize: '14px', color: '#555', lineHeight: '1.6', marginBottom: '15px' }}>
              This application evaluates the livability of <strong>Shanghai</strong> across two dimensions:
            </p>
            <ul style={{ fontSize: '14px', color: '#555', lineHeight: '1.6', paddingLeft: '20px', marginBottom: '20px' }}>
              <li style={{ marginBottom: '8px' }}><strong>Universal Baseline:</strong> Evaluates access to 4 fundamental needs: <em>Supplying</em> (groceries), <em>Caring</em> (health), <em>Learning</em> (education), and <em>Enjoying</em> (culture).</li>
              <li><strong>Track A - Healthy Lifestyle:</strong> A specialized layer assessing access to preventative health and sports facilities (parks, gyms, yoga studios, etc.).</li>
            </ul>
            <button onClick={() => setShowAbout(false)} style={{ padding: '10px', background: '#3498DB', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%', fontWeight: 'bold', fontSize: '14px' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* MODAL : DATA TRANSPARENCY */}
      {showTransparency && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', 
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10
        }}>
          <div style={{
            background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', width: '500px', maxWidth: '90%', fontFamily: 'sans-serif'
          }}>
            <h2 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>Data Transparency & Methodology</h2>
            <p style={{ fontSize: '14px', color: '#555', lineHeight: '1.6', marginBottom: '15px' }}>
              To ensure a reproducible and rigorous analytical pipeline, this project relies on empirical data and strict semantic filtering:
            </p>
            <ul style={{ fontSize: '13px', color: '#555', lineHeight: '1.6', paddingLeft: '20px', margin: '0 0 20px 0' }}>
              <li style={{ marginBottom: '8px' }}><strong>Data Provenance:</strong> Point of Interest (POI) data was sourced via Amap/GaoDe mapping services. A strict semantic filter was applied to reduce statistical noise, keeping only structural amenities (e.g., dropping pet shops from the "Caring" category).</li>
              <li style={{ marginBottom: '8px' }}><strong>Isochrone Routing:</strong> Network modeling relies on OpenStreetMap data. 15-minute travel areas were computed using Dijkstra's shortest-path algorithm.</li>
              <li style={{ marginBottom: '8px' }}><strong>Empirical Speeds:</strong> Calculations use literature-backed speeds: Walking (1.45 m/s), Cycling (3.61 m/s), and Driving (6.75 m/s in peak hours).</li>
              <li><strong>Limitations:</strong> Air Quality (AQI) and NDVI tracking were descoped from the Healthy Lifestyle track to prioritize the accuracy and depth of the sport facilities' semantic filtering.</li>
            </ul>
            <button onClick={() => setShowTransparency(false)} style={{ padding: '10px', background: '#3498DB', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%', fontWeight: 'bold', fontSize: '14px' }}>
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}