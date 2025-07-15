/**
 * Visualizer.js
 * 
 * Visualization module for applying acuteness analysis coloring to Three.js meshes.
 * This module handles the mapping of analysis scores to colors and applies them to geometry.
 */

// THREE.js objects will be injected from the main application
let THREE = null;
let ConvexGeometry = null;

/**
 * Initialize the visualizer with THREE.js objects
 * @param {Object} threeJS - The THREE.js object
 * @param {Object} convexGeometry - The ConvexGeometry class
 */
export function initVisualizer(threeJS, convexGeometry) {
    THREE = threeJS;
    ConvexGeometry = convexGeometry;
    console.log('Visualizer initialized with THREE.js objects');
}

/**
 * Check if the visualizer is properly initialized
 * @returns {boolean} True if initialized, false otherwise
 */
function isInitialized() {
    if (!THREE || !ConvexGeometry) {
        console.error('Visualizer not initialized. Call initVisualizer() first.');
        return false;
    }
    return true;
}

/**
 * Apply minimum image convention for periodic boundaries
 * @param {Array} p1 - First point [x, y, z]
 * @param {Array} p2 - Second point [x, y, z]
 * @returns {Array} Corrected p2 position
 */
function getMinimumImage(p1, p2) {
    const corrected = [p2[0], p2[1], p2[2]];
    
    for (let i = 0; i < 3; i++) {
        const delta = p2[i] - p1[i];
        if (delta > 0.5) {
            corrected[i] -= 1.0;
        } else if (delta < -0.5) {
            corrected[i] += 1.0;
        }
    }
    
    return corrected;
}

/**
 * Color mapping utility - converts a normalized value [0,1] to a color
 * Uses a blue-to-red gradient where blue = low acuteness, red = high acuteness
 * @param {number} value - Normalized value between 0 and 1
 * @param {string} analysisType - Type of analysis (CELL, FACE, VERTEX, EDGE)
 * @returns {number} Color as hex integer
 */
function mapValueToColor(value, analysisType = '') {
    // Clamp value to [0, 1]
    const normalizedValue = Math.max(0, Math.min(1, value));
    
    // Check if custom colors are defined for this analysis type
    const customColorsKey = analysisType ? `legendCustomColors_${analysisType}` : 'legendCustomColors';
    const customColors = window[customColorsKey] || window.legendCustomColors;
    
    if (customColors && customColors.length > 0) {
        // Use custom colors
        const steps = customColors.length - 1;
        const index = Math.floor(normalizedValue * steps);
        const fraction = (normalizedValue * steps) - index;
        
        if (index >= steps) {
            return customColors[steps];
        }
        
        // Interpolate between colors
        const color1 = customColors[index];
        const color2 = customColors[index + 1];
        
        const r1 = (color1 >> 16) & 0xFF;
        const g1 = (color1 >> 8) & 0xFF;
        const b1 = color1 & 0xFF;
        
        const r2 = (color2 >> 16) & 0xFF;
        const g2 = (color2 >> 8) & 0xFF;
        const b2 = color2 & 0xFF;
        
        const r = Math.floor(r1 + (r2 - r1) * fraction);
        const g = Math.floor(g1 + (g2 - g1) * fraction);
        const b = Math.floor(b1 + (b2 - b1) * fraction);
        
        return (r << 16) | (g << 8) | b;
    }
    
    // Default Blue-to-red gradient
    // Blue (0x0000FF) at value 0, Red (0xFF0000) at value 1
    const red = Math.floor(255 * normalizedValue);
    const blue = Math.floor(255 * (1 - normalizedValue));
    const green = 0;
    
    return (red << 16) | (green << 8) | blue;
}

/**
 * Create a color legend for the acuteness analysis
 * @param {number} maxScore - Maximum score in the analysis
 * @param {string} analysisType - Type of analysis (CELL, FACE, VERTEX, EDGE)
 * @param {number} topOffset - Vertical offset from top in pixels
 * @returns {string} HTML string for the color legend
 */
function createColorLegend(maxScore, analysisType = '', topOffset = 10) {
    const steps = 5;
    let legendHTML = `<div id="acuteness-legend-${analysisType.toLowerCase()}" class="acuteness-legend" style="position: absolute; top: ${topOffset}px; left: 10px; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 5px; font-size: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">`;
    
    // Add title based on analysis type
    const titles = {
        'CELL': 'Cell Acute Angles',
        'FACE': 'Face Acute Angles', 
        'VERTEX': 'Vertex Acute Angles',
        'EDGE': 'Edge Acute Angles'
    };
    const title = titles[analysisType] || 'Acute Angles Scale';
    legendHTML += `<div style="font-weight: bold; margin-bottom: 8px;">${title}</div>`;
    
    // Use FIXED ranges for consistency - different ranges for different analysis types
    let fixedRanges;
    
    if (analysisType === 'FACE') {
        // Faces typically have fewer acute angles (they're 2D polygons)
        fixedRanges = [
            { start: 0, end: 0, label: '0' },
            { start: 1, end: 1, label: '1' },
            { start: 2, end: 2, label: '2' },
            { start: 3, end: 3, label: '3' },
            { start: 4, end: 4, label: '4' },
            { start: 5, end: 999, label: '5+' }
        ];
    } else if (analysisType === 'VERTEX') {
        // Vertices measure angles at tetrahedra vertices
        fixedRanges = [
            { start: 0, end: 0, label: '0' },
            { start: 1, end: 2, label: '1-2' },
            { start: 3, end: 5, label: '3-5' },
            { start: 6, end: 8, label: '6-8' },
            { start: 9, end: 12, label: '9-12' },
            { start: 13, end: 999, label: '13+' }
        ];
    } else if (analysisType === 'EDGE') {
        // Edges measure acute angles between Voronoi vertices
        fixedRanges = [
            { start: 0, end: 0, label: '0' },
            { start: 1, end: 2, label: '1-2' },
            { start: 3, end: 5, label: '3-5' },
            { start: 6, end: 8, label: '6-8' },
            { start: 9, end: 12, label: '9-12' },
            { start: 13, end: 999, label: '13+' }
        ];
    } else {
        // CELL - Count of acute angles across all faces of the polyhedron
        // A typical Voronoi cell has 10-20 faces with 3-6 vertices each
        fixedRanges = [
            { start: 0, end: 10, label: '0-10' },
            { start: 11, end: 20, label: '11-20' },
            { start: 21, end: 30, label: '21-30' },
            { start: 31, end: 40, label: '31-40' },
            { start: 41, end: 50, label: '41-50' },
            { start: 51, end: 999, label: '51+' }
        ];
    }
    
    // Create legend items with fixed ranges
    for (let i = 0; i < fixedRanges.length; i++) {
        const value = i / steps;
        const color = mapValueToColor(value, analysisType);
        const colorHex = '#' + color.toString(16).padStart(6, '0');
        
        const range = fixedRanges[i];
        const label = range.label;
        const rangeStart = range.start;
        const rangeEnd = range.end;
        
        legendHTML += `<div style="display: flex; align-items: center; margin: 4px 0; padding: 2px;">`;
        // Color swatch with color picker
        legendHTML += `<input type="color" id="legend-color-${analysisType.toLowerCase()}-${i}" value="${colorHex}" style="width: 24px; height: 24px; margin-right: 8px; border: 1px solid #ccc; cursor: pointer; padding: 0; border-radius: 3px;" onchange="window.updateLegendColors('${analysisType}')" title="Click to change color">`;
        // Range label
        legendHTML += `<span style="font-size: 11px; line-height: 1.2; width: 40px;">${label}</span>`;
        
        // Only add opacity slider for CELL and FACE types (not for VERTEX or EDGE)
        if (analysisType === 'CELL' || analysisType === 'FACE') {
            // Opacity slider with range data attributes
            // Check if we have a saved opacity for this range
            let savedOpacity = 0.6;
            if (window.savedLegendOpacities && window.savedLegendOpacities.length > 0) {
                const saved = window.savedLegendOpacities.find(op => 
                    op.min === rangeStart && op.max === rangeEnd
                );
                if (saved) {
                    savedOpacity = saved.opacity;
                }
            }
            
            legendHTML += `<input type="range" id="legend-opacity-${analysisType.toLowerCase()}-${i}" data-range-min="${rangeStart}" data-range-max="${rangeEnd}" min="0" max="1" step="0.01" value="${savedOpacity}" style="width: 60px; margin-left: 8px;" oninput="window.updateLegendOpacityValue(${i}, this.value)" onchange="window.updateLegendOpacities()" title="Opacity">`;
            // Opacity value
            legendHTML += `<span id="legend-opacity-value-${i}" style="font-size: 10px; margin-left: 4px; width: 30px;">${savedOpacity.toFixed(2)}</span>`;
        }
        
        legendHTML += `</div>`;
    }
    
    legendHTML += '</div>';
    return legendHTML;
}

/**
 * Check if a score value should be visible based on legend settings
 * @param {number} score - The acuteness score
 * @param {number} maxScore - Maximum possible score
 * @returns {boolean} Whether the score should be visible
 */
function isScoreVisible(score, maxScore) {
    // Always show all scores since we removed the checkboxes
    return true;
}

/**
 * Get opacity for a specific score based on legend settings
 * @param {number} score - The acuteness score
 * @param {number} maxScore - Maximum possible score
 * @returns {number} Opacity value between 0 and 1
 */
function getOpacityForScore(score, maxScore) {
    if (!window.legendOpacities) {
        return 0.6; // Default opacity
    }
    
    // Find which range this score belongs to
    for (let i = 0; i < window.legendOpacities.length; i++) {
        const range = window.legendOpacities[i];
        if (score >= range.min && score <= range.max) {
            return range.opacity;
        }
    }
    
    return 0.6; // Default if not found
}

/**
 * Initialize or restore opacity settings for the legend
 */
function initializeOpacitySettings() {
    // The sliders are already set with saved values in the HTML
    // Just need to initialize the legendOpacities if not already set
    if (!window.legendOpacities || window.legendOpacities.length === 0) {
        const opacitySliders = document.querySelectorAll('.acuteness-legend input[type="range"]');
        const opacities = [];
        
        opacitySliders.forEach((slider, index) => {
            opacities.push({
                min: parseInt(slider.getAttribute('data-range-min')),
                max: parseInt(slider.getAttribute('data-range-max')),
                opacity: parseFloat(slider.value)
            });
        });
        
        window.legendOpacities = opacities;
    }
}

/**
 * Get color index for a specific score based on the legend ranges
 * @param {number} score - The acuteness score
 * @param {number} maxScore - Maximum possible score
 * @param {string} analysisType - Type of analysis ('CELL', 'FACE', or 'VERTEX')
 * @returns {number} Normalized value between 0 and 1 for color mapping
 */
function getColorIndexForScore(score, maxScore, analysisType = 'CELL') {
    const steps = 5; // We have 6 color ranges (0-5)
    
    // Use the same fixed ranges as the legend
    let fixedRanges;
    
    if (analysisType === 'FACE') {
        fixedRanges = [
            { start: 0, end: 0 },      // index 0
            { start: 1, end: 1 },      // index 1
            { start: 2, end: 2 },      // index 2
            { start: 3, end: 3 },      // index 3
            { start: 4, end: 4 },      // index 4
            { start: 5, end: 999 }     // index 5
        ];
    } else if (analysisType === 'VERTEX') {
        fixedRanges = [
            { start: 0, end: 0 },      // index 0
            { start: 1, end: 2 },      // index 1
            { start: 3, end: 5 },      // index 2
            { start: 6, end: 8 },      // index 3
            { start: 9, end: 12 },     // index 4
            { start: 13, end: 999 }    // index 5
        ];
    } else if (analysisType === 'EDGE') {
        fixedRanges = [
            { start: 0, end: 0 },      // index 0
            { start: 1, end: 2 },      // index 1
            { start: 3, end: 5 },      // index 2
            { start: 6, end: 8 },      // index 3
            { start: 9, end: 12 },     // index 4
            { start: 13, end: 999 }    // index 5
        ];
    } else {
        // CELL - Count of acute angles across all faces
        fixedRanges = [
            { start: 0, end: 10 },     // index 0
            { start: 11, end: 20 },    // index 1
            { start: 21, end: 30 },    // index 2
            { start: 31, end: 40 },    // index 3
            { start: 41, end: 50 },    // index 4
            { start: 51, end: 999 }    // index 5
        ];
    }
    
    for (let i = 0; i < fixedRanges.length; i++) {
        const range = fixedRanges[i];
        if (score >= range.start && score <= range.end) {
            return i / steps;
        }
    }
    
    return 1; // Default to max color if not found
}

/**
 * Apply analysis coloring to cell meshes
 * @param {Object} scene - Three.js scene object
 * @param {Object} voronoiFacesGroup - Three.js group containing Voronoi face meshes
 * @param {Array} analysisScores - Array of acuteness scores for each cell
 * @param {Object} computation - DelaunayComputation object
 * @param {number} defaultOpacity - Default opacity value for the cell materials (0.0 to 1.0)
 */
export function applyCellColoring(scene, voronoiFacesGroup, analysisScores, computation, defaultOpacity = 0.6) {
    console.log('Applying cell coloring for acuteness analysis...');
    
    if (!isInitialized()) return;
    
    if (!analysisScores || analysisScores.length === 0) {
        console.warn('No analysis scores provided for cell coloring');
        return;
    }
    
    // Validate scores to prevent NaN or undefined values
    const validScores = analysisScores.filter(score => 
        typeof score === 'number' && !isNaN(score) && isFinite(score)
    );
    
    if (validScores.length !== analysisScores.length) {
        console.warn(`Invalid scores detected: ${analysisScores.length - validScores.length} scores filtered out`);
    }
    
    // Calculate min and max scores for normalization
    const minScore = validScores.length > 0 ? Math.min(...validScores) : 0;
    const maxScore = validScores.length > 0 ? Math.max(...validScores) : 0;
    const range = maxScore - minScore;
    
    console.log(`Cell coloring range: ${minScore} to ${maxScore}`);
    
    // Get the cells mapping
    const cells = computation.getCells();
    
    // Clear existing meshes
    console.log('Cell coloring: Clearing voronoiFacesGroup, current children:', voronoiFacesGroup.children.length);
    voronoiFacesGroup.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    });
    voronoiFacesGroup.clear();
    
    // Apply coloring to each cell
    let cellIndex = 0;
    let visibleCount = 0;
    let hiddenCount = 0;
    let zeroOpacityCount = 0;
    
    for (const [vertexIndex, cellVertices] of cells.entries()) {
        if (cellIndex >= analysisScores.length) break;
        
        const score = analysisScores[cellIndex];
        
        // Validate individual score
        if (typeof score !== 'number' || isNaN(score) || !isFinite(score)) {
            console.warn(`Invalid score at index ${cellIndex}: ${score}`);
            cellIndex++;
            continue;
        }
        
        // Check if this score should be visible
        if (!isScoreVisible(score, maxScore)) {
            hiddenCount++;
            cellIndex++;
            continue;
        }
        
        // Get opacity for this specific score
        const scoreOpacity = getOpacityForScore(score, maxScore);
        
        // Skip cells with zero opacity to improve performance
        if (scoreOpacity === 0) {
            zeroOpacityCount++;
            cellIndex++;
            continue;
        }
        
        visibleCount++;
        
        // Use the same color mapping as the legend
        const colorIndex = getColorIndexForScore(score, maxScore, 'CELL');
        const color = mapValueToColor(colorIndex, 'CELL');
        
        // Create material with the computed color and individual opacity
        const material = new THREE.MeshPhongMaterial({
            color: color,
            opacity: scoreOpacity,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            alphaTest: 0.1
        });
        
        // Create convex geometry for the cell
        if (cellVertices.length >= 4) {
            try {
                let threeVertices;
                
                // Apply MIC correction for periodic cells to prevent transverse connections
                if (computation.isPeriodic && cellVertices.length > 0) {
                    // Apply MIC: Use first barycenter as reference, correct others to same periodic image
                    const reference = cellVertices[0];
                    threeVertices = cellVertices.map((v, index) => {
                        if (index === 0) {
                            return new THREE.Vector3(v[0], v[1], v[2]);
                        }
                        
                        // Apply MIC to bring vertex to same periodic image as reference
                        const corrected = getMinimumImage(reference, v);
                        return new THREE.Vector3(corrected[0], corrected[1], corrected[2]);
                    });
                } else {
                    // Non-periodic: use vertices as-is
                    threeVertices = cellVertices.map(v => new THREE.Vector3(v[0], v[1], v[2]));
                }
                
                const geometry = new ConvexGeometry(threeVertices);
                const mesh = new THREE.Mesh(geometry, material);
                // Store the score with the mesh so we can update opacity later
                mesh.userData.score = score;
                voronoiFacesGroup.add(mesh);
            } catch (error) {
                console.warn(`Failed to create cell mesh for vertex ${vertexIndex}:`, error);
            }
        }
        
        cellIndex++;
    }
    
    console.log(`Applied cell coloring: ${visibleCount} visible, ${hiddenCount} hidden, ${zeroOpacityCount} zero-opacity out of ${cellIndex} cells`);
    
    // Warn if all cells have the same score (potential bug)
    if (validScores.length > 10 && minScore === maxScore) {
        console.error('WARNING: All cells have the same score! This might indicate a calculation error.');
        console.error('Score value:', minScore);
    }
}

/**
 * Apply analysis coloring to face meshes
 * @param {Object} scene - Three.js scene object
 * @param {Object} voronoiFacesGroup - Three.js group containing Voronoi face meshes
 * @param {Array} analysisScores - Array of acuteness scores for each face
 * @param {Object} computation - DelaunayComputation object
 * @param {number} opacity - Opacity value for the face materials (0.0 to 1.0)
 */
export function applyFaceColoring(scene, voronoiFacesGroup, analysisScores, computation, defaultOpacity = 0.6) {
    console.log('Applying face coloring for acuteness analysis...');
    
    if (!isInitialized()) return;
    
    if (!analysisScores || analysisScores.length === 0) {
        console.warn('No analysis scores provided for face coloring');
        return;
    }
    
    // Calculate min and max scores for normalization
    const minScore = analysisScores.length > 0 ? Math.min(...analysisScores) : 0;
    const maxScore = analysisScores.length > 0 ? Math.max(...analysisScores) : 0;
    const range = maxScore - minScore;
    
    console.log(`Face coloring range: ${minScore} to ${maxScore}`);
    
    // Get the faces
    const faces = computation.getFaces();
    
    // Clear existing meshes
    voronoiFacesGroup.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    });
    voronoiFacesGroup.clear();
    
    // Apply coloring to each face
    for (let i = 0; i < Math.min(faces.length, analysisScores.length); i++) {
        const face = faces[i];
        const score = analysisScores[i];
        
        // Check if this score should be visible
        if (!isScoreVisible(score, maxScore)) {
            continue;
        }
        
        // Use the same color mapping as the legend
        const colorIndex = getColorIndexForScore(score, maxScore, 'FACE');
        const color = mapValueToColor(colorIndex, 'FACE');
        
        // Get opacity for this specific score
        const scoreOpacity = getOpacityForScore(score, maxScore);
        
        // Create material with the computed color and individual opacity
        const material = new THREE.MeshPhongMaterial({
            color: color,
            opacity: scoreOpacity,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            alphaTest: 0.1
        });
        
        // Create geometry for the face
        if (face.voronoiVertices.length >= 3) {
            try {
                // Face vertices are already MIC-corrected in getFaces()
                const threeVertices = face.voronoiVertices.map(v => new THREE.Vector3(v[0], v[1], v[2]));
                
                const geometry = new ConvexGeometry(threeVertices);
                const mesh = new THREE.Mesh(geometry, material);
                // Store the score with the mesh so we can update opacity later
                mesh.userData.score = score;
                voronoiFacesGroup.add(mesh);
            } catch (error) {
                console.warn(`Failed to create face mesh for face ${i}:`, error);
            }
        }
    }
    
    // Log face score distribution for debugging
    if (analysisScores && analysisScores.length > 0) {
        const distribution = {};
        analysisScores.forEach(score => {
            distribution[score] = (distribution[score] || 0) + 1;
        });
        console.log('Face acute angle distribution:', distribution);
        console.log('Face score range:', Math.min(...analysisScores), '-', Math.max(...analysisScores));
    }
    
    console.log(`Applied face coloring to ${faces.length} faces`);
}

/**
 * Apply analysis coloring to Voronoi vertices (dots representing tetrahedra barycenters)
 * @param {Object} scene - Three.js scene object
 * @param {Object} voronoiGroup - Three.js group containing Voronoi elements
 * @param {Array} analysisScores - Array of acuteness scores for each tetrahedron
 * @param {Object} computation - DelaunayComputation object
 * @param {number} thickness - Sphere radius for the vertex visualization
 */
export function applyVertexColoring(scene, voronoiGroup, analysisScores, computation, thickness = 0.015) {
    console.log('Applying vertex coloring to Voronoi vertices (dots)...');
    
    if (!isInitialized()) return;
    
    if (!analysisScores || analysisScores.length === 0) {
        console.warn('No analysis scores provided for vertex coloring');
        return;
    }
    
    // Calculate min and max scores for normalization
    const minScore = analysisScores.length > 0 ? Math.min(...analysisScores) : 0;
    const maxScore = analysisScores.length > 0 ? Math.max(...analysisScores) : 0;
    const range = maxScore - minScore;
    
    console.log(`Vertex coloring range: ${minScore} to ${maxScore}`);
    
    // Get the Voronoi vertices (barycenters)
    const voronoiVertices = computation.getVertices();
    
    // Clear existing Voronoi vertex meshes (spheres)
    // Create a copy of children array to avoid modification during iteration
    const childrenToRemove = voronoiGroup.children.filter(child => 
        child.geometry && child.geometry.type === 'SphereGeometry'
    );
    
    childrenToRemove.forEach(child => {
        child.geometry.dispose();
        child.material.dispose();
        voronoiGroup.remove(child);
    });
    
    // Create colored spheres for each Voronoi vertex using thickness parameter
    const sphereRadius = thickness;
    
    for (let i = 0; i < Math.min(voronoiVertices.length, analysisScores.length); i++) {
        const vertex = voronoiVertices[i];
        const score = analysisScores[i];
        
        // Check if this score should be visible
        if (!isScoreVisible(score, maxScore)) {
            continue;
        }
        
        // Use the same color mapping as the legend
        const colorIndex = getColorIndexForScore(score, maxScore, 'VERTEX');
        const color = mapValueToColor(colorIndex, 'VERTEX');
        
        // Create sphere geometry
        const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 16, 16);
        
        // Create material with the computed color
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.3
        });
        
        // Create mesh and position it
        const sphere = new THREE.Mesh(sphereGeometry, material);
        sphere.position.set(vertex[0], vertex[1], vertex[2]);
        voronoiGroup.add(sphere);
    }
    
    console.log(`Applied vertex coloring to ${voronoiVertices.length} Voronoi vertices`);
}

/**
 * Apply edge coloring based on edge acuteness analysis scores
 * @param {Object} scene - Three.js scene object
 * @param {Object} voronoiEdgesGroup - Three.js group containing Voronoi edges
 * @param {Array} analysisScores - Array of edge acuteness scores
 * @param {Object} computation - DelaunayComputation object containing edge data
 * @param {number} thickness - Line thickness for edges
 */
export function applyEdgeColoring(scene, voronoiEdgesGroup, analysisScores, computation, thickness = 0.015) {
    console.log('Applying edge coloring to Voronoi edges...');
    
    if (!isInitialized()) return;
    
    if (!analysisScores || analysisScores.length === 0) {
        console.warn('No analysis scores provided for edge coloring');
        return;
    }
    
    // Calculate min and max scores for normalization
    const minScore = analysisScores.length > 0 ? Math.min(...analysisScores) : 0;
    const maxScore = analysisScores.length > 0 ? Math.max(...analysisScores) : 0;
    const range = maxScore - minScore;
    
    console.log(`Edge coloring range: ${minScore} to ${maxScore}`);
    
    // Clear existing edge meshes
    voronoiEdgesGroup.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    });
    voronoiEdgesGroup.clear();
    
    // Apply colors to each edge
    computation.voronoiEdges.forEach((edge, index) => {
        if (index >= analysisScores.length) return;
        
        const score = analysisScores[index];
        
        // Check if this score should be visible
        if (!isScoreVisible(score, maxScore)) {
            return;
        }
        
        // Use the same color mapping as the legend
        const colorIndex = getColorIndexForScore(score, maxScore, 'EDGE');
        const color = mapValueToColor(colorIndex, 'EDGE');
        
        // Apply MIC correction for periodic edges
        let positions;
        if (computation.isPeriodic && edge.isPeriodic) {
            // Apply minimum image convention
            const p1 = edge.start;
            const p2 = edge.end;
            const p2_corrected = getMinimumImage(p1, p2);
            
            positions = new Float32Array([
                p1[0], p1[1], p1[2],
                p2_corrected[0], p2_corrected[1], p2_corrected[2]
            ]);
        } else {
            // Non-periodic edge - use as is
            positions = new Float32Array([
                edge.start[0], edge.start[1], edge.start[2],
                edge.end[0], edge.end[1], edge.end[2]
            ]);
        }
        
        // Create edge geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Create material with the computed color and thickness
        const material = new THREE.LineBasicMaterial({
            color: color,
            linewidth: thickness * 100, // Scale thickness for visibility
            opacity: edge.isPeriodic ? 0.8 : 1.0,
            transparent: edge.isPeriodic
        });
        
        // Create and add the line
        const line = new THREE.Line(geometry, material);
        voronoiEdgesGroup.add(line);
    });
    
    console.log(`Applied edge coloring to ${computation.voronoiEdges.length} Voronoi edges`);
}

/**
 * Main function to apply analysis coloring based on mode
 * @param {Object} scene - Three.js scene object
 * @param {Object} meshGroups - Object containing mesh groups (tetrahedraGroup, voronoiFacesGroup)
 * @param {Object} analysisResults - Object containing all analysis results
 * @param {string} coloringMode - 'CELL', 'FACE', or 'VERTEX'
 * @param {Object} computation - DelaunayComputation object
 */
export function applyAnalysisColoring(scene, meshGroups, analysisResults, coloringMode, computation) {
    console.log(`Applying analysis coloring in ${coloringMode} mode...`);
    console.log('Analysis results:', analysisResults);
    console.log('Mesh groups:', meshGroups);
    
    if (!isInitialized()) return;
    
    // Remove existing legend
    const existingLegend = document.getElementById('acuteness-legend');
    if (existingLegend) {
        existingLegend.remove();
    }
    
    switch (coloringMode) {
        case 'CELL':
            console.log('Applying cell coloring...');
            if (analysisResults.cellScores) {
                console.log('Cell scores:', analysisResults.cellScores);
                applyCellColoring(scene, meshGroups.voronoiFacesGroup, analysisResults.cellScores, computation);
            } else {
                console.warn('No cell scores available');
            }
            break;
        case 'FACE':
            console.log('Applying face coloring...');
            if (analysisResults.faceScores) {
                console.log('Face scores:', analysisResults.faceScores);
                applyFaceColoring(scene, meshGroups.voronoiFacesGroup, analysisResults.faceScores, computation);
            } else {
                console.warn('No face scores available');
            }
            break;
        case 'VERTEX':
            console.log('Applying vertex coloring...');
            if (analysisResults.vertexScores) {
                console.log('Vertex scores:', analysisResults.vertexScores);
                applyVertexColoring(scene, meshGroups.voronoiGroup, analysisResults.vertexScores, computation);
            } else {
                console.warn('No vertex scores available');
            }
            break;
        default:
            console.warn(`Unknown coloring mode: ${coloringMode}`);
    }
}

/**
 * Create and show a legend for the given analysis type
 * @param {string} analysisType - Type of analysis (CELL, FACE, VERTEX, EDGE)
 * @param {Array} scores - Array of scores for calculating max
 * @param {number} verticalOffset - Additional vertical offset for positioning multiple legends
 */
export function createAndShowLegend(analysisType, scores, verticalOffset = 0) {
    if (!scores || scores.length === 0) return;
    
    const maxScore = Math.max(...scores);
    const topOffset = 10 + verticalOffset;
    
    // Remove existing legend of this type
    const existingLegend = document.getElementById(`acuteness-legend-${analysisType.toLowerCase()}`);
    if (existingLegend) {
        existingLegend.remove();
    }
    
    // Create and add the legend
    const legendHTML = createColorLegend(maxScore, analysisType, topOffset);
    document.body.insertAdjacentHTML('beforeend', legendHTML);
    
    // Initialize opacity settings
    initializeOpacitySettings();
}

/**
 * Remove all acuteness analysis coloring and legend
 */
export function removeAnalysisColoring() {
    console.log('Removing acuteness analysis coloring...');
    
    // Remove all legends (using class selector)
    const existingLegends = document.querySelectorAll('.acuteness-legend');
    existingLegends.forEach(legend => legend.remove());
    
    console.log('Acuteness analysis coloring removed');
} 