"""
BreezeBand - Auto-Walker BLE Gateway Simulator
This script simulates a guest wearing a BreezeBand walking around the resort.
It automatically pings the central server every 5 seconds, hopping between different
simulated BLE gateways with randomized RSSI (signal strength) values.

This script demonstrates Hardware/Software Decoupling:
The backend does not know this is a Python script. It processes the JSON payload 
exactly as it would if it came from a physical ESP32 or Cisco BLE Gateway.
"""

import time
import random
import requests

# Configuration
API_ENDPOINT = "http://localhost:8000/api/location/ping" # Change to production URL if testing remote
BAND_ID = "A1B2"
GATEWAYS = [
    "pool_gateway_1", 
    "lobby_gateway_1", 
    "beach_gateway_1", 
    "restaurant_gateway_1",
    "gym_gateway_1"
]

def simulate_walking():
    print(f"Starting Auto-Walker Simulator for Band: {BAND_ID}")
    print(f"Targeting Endpoint: {API_ENDPOINT}")
    print("-" * 50)
    
    while True:
        # Simulate hardware behavior: randomly pick the closest gateway and calculate RSSI
        # RSSI is negative; closer to 0 is stronger signal (e.g., -30 is very close, -90 is far)
        gateway = random.choice(GATEWAYS)
        rssi = random.randint(-90, -30)
        
        # Assemble the exact payload expected by the backend contract
        payload = {
            "gateway_id": gateway,
            "band_id": BAND_ID,
            "rssi": rssi
        }
        
        print(f"Ping -> Gateway: {gateway:22} | Band: {BAND_ID} | RSSI: {rssi} dBm", end=" ... ")
        
        try:
            # Send the simulated telemetry data to the central server
            response = requests.post(API_ENDPOINT, json=payload, timeout=3)
            if response.status_code in (200, 201):
                print(f"OK (Status {response.status_code})")
            else:
                print(f"FAILED (Status {response.status_code}) - {response.text}")
        except requests.exceptions.RequestException as e:
            # Catch network errors (e.g., server not running yet)
            print(f"ERROR: Could not connect to server ({e})")
            
        # Wait 5 seconds before the next ping to simulate walking speed
        time.sleep(5)

if __name__ == "__main__":
    try:
        simulate_walking()
    except KeyboardInterrupt:
        print("\nSimulator stopped by user.")
