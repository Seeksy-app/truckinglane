import { useState, useEffect } from "react";

interface WeatherData {
  temp: number;
  condition: string;
  location: string;
  icon: string;
}

const WEATHER_CACHE_KEY = "weather_cache";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

interface CachedWeather {
  data: WeatherData;
  timestamp: number;
}

// Fallback weather for when geolocation/API fails
const FALLBACK_WEATHER: WeatherData = {
  temp: 55,
  condition: "Clear",
  location: "Your Area",
  icon: "☀️",
};

const getWeatherIcon = (condition: string): string => {
  const lower = condition.toLowerCase();
  if (lower.includes("rain") || lower.includes("drizzle")) return "🌧️";
  if (lower.includes("thunder") || lower.includes("storm")) return "⛈️";
  if (lower.includes("snow") || lower.includes("sleet")) return "🌨️";
  if (lower.includes("cloud") || lower.includes("overcast")) return "☁️";
  if (lower.includes("partly") || lower.includes("few clouds")) return "⛅";
  if (lower.includes("fog") || lower.includes("mist")) return "🌫️";
  if (lower.includes("clear") || lower.includes("sunny")) return "☀️";
  return "🌤️";
};

export function useWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeather = async () => {
      // Check cache first
      try {
        const cached = localStorage.getItem(WEATHER_CACHE_KEY);
        if (cached) {
          const { data, timestamp }: CachedWeather = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setWeather(data);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Ignore cache errors
      }

      // Try to get location
      if (!navigator.geolocation) {
        setWeather(FALLBACK_WEATHER);
        setLoading(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          try {
            // Use Open-Meteo free API (no API key needed)
            const response = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`
            );
            
            if (!response.ok) throw new Error("Weather API error");
            
            const data = await response.json();
            const temp = Math.round(data.current.temperature_2m);
            const weatherCode = data.current.weather_code;
            
            // Map WMO weather codes to conditions
            const conditionMap: Record<number, string> = {
              0: "Clear sky",
              1: "Mainly clear",
              2: "Partly cloudy",
              3: "Overcast",
              45: "Foggy",
              48: "Depositing rime fog",
              51: "Light drizzle",
              53: "Moderate drizzle",
              55: "Dense drizzle",
              61: "Slight rain",
              63: "Moderate rain",
              65: "Heavy rain",
              71: "Slight snow",
              73: "Moderate snow",
              75: "Heavy snow",
              80: "Rain showers",
              81: "Moderate rain showers",
              82: "Violent rain showers",
              95: "Thunderstorm",
              96: "Thunderstorm with hail",
              99: "Severe thunderstorm",
            };
            
            const condition = conditionMap[weatherCode] || "Clear";
            
            // Reverse geocode for city name
            let location = "Your Area";
            try {
              const geoResponse = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
              );
              if (geoResponse.ok) {
                const geoData = await geoResponse.json();
                location = geoData.city || geoData.locality || geoData.principalSubdivision || "Your Area";
              }
            } catch {
              // Use fallback location
            }
            
            const weatherData: WeatherData = {
              temp,
              condition,
              location,
              icon: getWeatherIcon(condition),
            };
            
            setWeather(weatherData);
            
            // Cache the result
            localStorage.setItem(
              WEATHER_CACHE_KEY,
              JSON.stringify({ data: weatherData, timestamp: Date.now() })
            );
          } catch (err) {
            console.error("Weather fetch error:", err);
            setError("Failed to fetch weather");
            setWeather(FALLBACK_WEATHER);
          } finally {
            setLoading(false);
          }
        },
        (geoError) => {
          console.log("Geolocation error:", geoError.message);
          setWeather(FALLBACK_WEATHER);
          setLoading(false);
        },
        { timeout: 5000, maximumAge: CACHE_TTL }
      );
    };

    fetchWeather();
  }, []);

  return { weather, loading, error };
}
