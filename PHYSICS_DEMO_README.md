# Physics-Based Voronoi Cell Expansion Demo

This demo implements **true cell expansion** where growing cells actually push their neighbors away, creating realistic expansion effects.

## Key Differences from the Original Demo

### Original Demo (expansion-shrink-demo.html)
- Only moves the generator point relative to cell centroid
- Cell just shifts position without affecting neighbors
- No real expansion - just movement

### Physics Demo (physics-expansion-demo.html)
- Growing cells apply forces to their neighbors
- Neighbors are pushed away, creating space for expansion
- Uses physics simulation with forces, velocities, and damping
- Real expansion effect that affects the entire structure

## How It Works

1. **Neighbor Detection**: The system identifies which cells share edges (are neighbors)
2. **Force Calculation**: Growing cells apply repulsive forces to their neighbors
3. **Physics Simulation**: Forces create velocities that move generator points
4. **Voronoi Update**: The diagram is recomputed with new positions
5. **Visual Feedback**: Growing cells shown in red, others in blue

## Controls

- **Expansion Mode**: 
  - Single Cell: Only the central cell grows
  - Multiple Cells: 30% of cells grow randomly
  - Pattern-Based: Checkerboard pattern of growing cells

- **Growth Rate**: Positive = expansion, Negative = contraction
- **Force Strength**: How strongly cells push/pull neighbors
- **Damping**: Reduces oscillations for stability

## Running the Demo

1. Start a local server: `python3 -m http.server 8001`
2. Open: `http://localhost:8001/physics-expansion-demo.html`
3. Adjust Growth Rate to see cells expand and push neighbors
4. Try different modes and parameters

## Technical Implementation

The physics engine (`PhysicsExpansion.js`) implements:
- Neighbor detection via shared Voronoi vertices
- Force calculation using inverse square law
- Velocity integration with damping
- Real-time position updates

This creates genuine cell expansion where growth actually displaces neighboring cells, solving the problem with the original approach. 