import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { useTenant } from '../contexts/TenantContext';
import { useToast } from '../hooks/use-toast';

// Importer le composant depuis App.js complet
// Ce composant sera copié tel quel depuis App.js
