/**
 * WorkerManager.js
 * 
 * Manages Web Workers for parallel acuteness computation
 * Handles task distribution, load balancing, and result aggregation
 */

export class WorkerManager {
    constructor(maxWorkers = 4) {
        this.maxWorkers = Math.min(maxWorkers, navigator.hardwareConcurrency || 4);
        this.workers = [];
        this.taskQueue = [];
        this.activeTasksCount = 0;
        this.results = new Map();
        this.isInitialized = false;
    }
    
    /**
     * Initialize the worker pool
     */
    async initialize() {
        if (this.isInitialized) return;
        
        console.log(`Initializing ${this.maxWorkers} Web Workers for acuteness computation...`);
        
        // Create worker pool
        for (let i = 0; i < this.maxWorkers; i++) {
            try {
                const worker = new Worker('./src/js/AcutenessWorker.js');
                worker.workerId = i;
                worker.isIdle = true;
                
                // Set up message handler
                worker.onmessage = (e) => this.handleWorkerMessage(worker, e);
                worker.onerror = (error) => this.handleWorkerError(worker, error);
                
                this.workers.push(worker);
            } catch (error) {
                console.error(`Failed to create worker ${i}:`, error);
            }
        }
        
        this.isInitialized = true;
        console.log(`Worker pool initialized with ${this.workers.length} workers`);
    }
    
    /**
     * Handle messages from workers
     * @param {Worker} worker - The worker that sent the message
     * @param {MessageEvent} e - The message event
     */
    handleWorkerMessage(worker, e) {
        const { type, taskType, result, error } = e.data;
        
        worker.isIdle = true;
        this.activeTasksCount--;
        
        if (type === 'SUCCESS') {
            // Store the result
            const taskId = worker.currentTaskId;
            this.results.set(taskId, result);
            
            console.log(`Worker ${worker.workerId} completed ${taskType} task in ${result.metrics.duration.toFixed(2)}ms`);
        } else if (type === 'ERROR') {
            console.error(`Worker ${worker.workerId} error in ${taskType}:`, error);
            // Store error result
            const taskId = worker.currentTaskId;
            this.results.set(taskId, { error });
        }
        
        // Process next task in queue
        this.processNextTask();
    }
    
    /**
     * Handle worker errors
     * @param {Worker} worker - The worker that errored
     * @param {ErrorEvent} error - The error event
     */
    handleWorkerError(worker, error) {
        console.error(`Worker ${worker.workerId} error:`, error);
        worker.isIdle = true;
        this.activeTasksCount--;
        
        // Process next task in queue
        this.processNextTask();
    }
    
    /**
     * Add a task to the queue
     * @param {string} taskType - Type of task (CELL_ACUTENESS, FACE_ACUTENESS, VERTEX_ACUTENESS)
     * @param {Object} data - Task data
     * @param {string} taskId - Unique task identifier
     */
    addTask(taskType, data, taskId) {
        this.taskQueue.push({
            taskType,
            data,
            taskId,
            timestamp: Date.now()
        });
        
        this.processNextTask();
    }
    
    /**
     * Process the next task in the queue
     */
    processNextTask() {
        if (this.taskQueue.length === 0) return;
        
        // Find an idle worker
        const idleWorker = this.workers.find(w => w.isIdle);
        if (!idleWorker) return;
        
        const task = this.taskQueue.shift();
        
        // Assign task to worker
        idleWorker.isIdle = false;
        idleWorker.currentTaskId = task.taskId;
        this.activeTasksCount++;
        
        // Send task to worker
        idleWorker.postMessage({
            type: task.taskType,
            data: task.data
        });
    }
    
    /**
     * Wait for all tasks to complete
     * @returns {Promise} Promise that resolves when all tasks are done
     */
    async waitForCompletion() {
        return new Promise((resolve) => {
            const checkCompletion = () => {
                if (this.taskQueue.length === 0 && this.activeTasksCount === 0) {
                    resolve();
                } else {
                    setTimeout(checkCompletion, 10);
                }
            };
            checkCompletion();
        });
    }
    
    /**
     * Get results for all completed tasks
     * @returns {Map} Map of taskId to results
     */
    getResults() {
        return new Map(this.results);
    }
    
    /**
     * Clear all results and reset
     */
    clearResults() {
        this.results.clear();
    }
    
    /**
     * Terminate all workers
     */
    terminate() {
        console.log('Terminating worker pool...');
        
        this.workers.forEach(worker => {
            worker.terminate();
        });
        
        this.workers = [];
        this.taskQueue = [];
        this.results.clear();
        this.isInitialized = false;
        this.activeTasksCount = 0;
    }
    
    /**
     * Get worker pool status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            totalWorkers: this.workers.length,
            idleWorkers: this.workers.filter(w => w.isIdle).length,
            activeWorkers: this.workers.filter(w => !w.isIdle).length,
            queuedTasks: this.taskQueue.length,
            activeTasks: this.activeTasksCount,
            completedTasks: this.results.size,
            isInitialized: this.isInitialized
        };
    }
}

/**
 * Utility function to chunk an array into smaller arrays
 * @param {Array} array - Array to chunk
 * @param {number} chunkSize - Size of each chunk
 * @returns {Array} Array of chunks
 */
export function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

/**
 * Parallel acuteness computation using Web Workers
 * @param {DelaunayComputation} computation - The computation object
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Promise that resolves to analysis results
 */
export async function parallelAcutenessAnalysis(computation, options = {}) {
    const {
        maxScore = Infinity,
        searchRadius = 0.3,
        maxWorkers = 4,
        chunkSize = 10
    } = options;
    
    console.log('Starting parallel acuteness analysis...');
    const startTime = performance.now();
    
    // Initialize worker manager
    const workerManager = new WorkerManager(maxWorkers);
    await workerManager.initialize();
    
    try {
        // Prepare data for parallel processing
        const cells = computation.getCells();
        const faces = computation.getFaces();
        const tetrahedra = computation.getDelaunayTetrahedra();
        const points = computation.getPoints();
        
        // Create chunks for parallel processing
        const cellChunks = chunkArray(
            Array.from(cells.entries()).map(([cellIdx, cellVertices]) => ({cellIdx, cellVertices})),
            chunkSize
        );
        
        const faceChunks = chunkArray(faces, chunkSize);
        const tetraChunks = chunkArray(tetrahedra, chunkSize);
        
        console.log(`Created ${cellChunks.length} cell chunks, ${faceChunks.length} face chunks, ${tetraChunks.length} tetra chunks`);
        
        // Submit tasks to workers
        let taskId = 0;
        
        // Cell acuteness tasks
        cellChunks.forEach((chunk, index) => {
            workerManager.addTask('CELL_ACUTENESS', {
                cellChunk: chunk,
                maxScore,
                searchRadius
            }, `cell-${index}`);
        });
        
        // Face acuteness tasks
        faceChunks.forEach((chunk, index) => {
            workerManager.addTask('FACE_ACUTENESS', {
                faceChunk: chunk,
                maxScore
            }, `face-${index}`);
        });
        
        // Vertex acuteness tasks
        tetraChunks.forEach((chunk, index) => {
            workerManager.addTask('VERTEX_ACUTENESS', {
                tetraChunk: chunk,
                points,
                maxScore
            }, `vertex-${index}`);
        });
        
        // Wait for all tasks to complete
        await workerManager.waitForCompletion();
        
        // Aggregate results
        const results = workerManager.getResults();
        const aggregatedResults = {
            vertexScores: [],
            faceScores: [],
            cellScores: [],
            performance: {
                totalTime: performance.now() - startTime,
                workerMetrics: [],
                parallelEfficiency: 0
            }
        };
        
        // Aggregate vertex scores
        const vertexResults = Array.from(results.entries())
            .filter(([taskId]) => taskId.startsWith('vertex-'))
            .sort(([a], [b]) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]));
        
        vertexResults.forEach(([taskId, result]) => {
            if (result.error) {
                console.error(`Vertex task ${taskId} failed:`, result.error);
            } else {
                result.scores.forEach(({tetraIdx, score}) => {
                    aggregatedResults.vertexScores[tetraIdx] = score;
                });
                aggregatedResults.performance.workerMetrics.push({
                    taskId,
                    type: 'vertex',
                    ...result.metrics
                });
            }
        });
        
        // Aggregate face scores
        const faceResults = Array.from(results.entries())
            .filter(([taskId]) => taskId.startsWith('face-'))
            .sort(([a], [b]) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]));
        
        faceResults.forEach(([taskId, result]) => {
            if (result.error) {
                console.error(`Face task ${taskId} failed:`, result.error);
            } else {
                result.scores.forEach(({faceIdx, score}) => {
                    aggregatedResults.faceScores[faceIdx] = score;
                });
                aggregatedResults.performance.workerMetrics.push({
                    taskId,
                    type: 'face',
                    ...result.metrics
                });
            }
        });
        
        // Aggregate cell scores
        const cellResults = Array.from(results.entries())
            .filter(([taskId]) => taskId.startsWith('cell-'))
            .sort(([a], [b]) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]));
        
        const cellScoreMap = new Map();
        cellResults.forEach(([taskId, result]) => {
            if (result.error) {
                console.error(`Cell task ${taskId} failed:`, result.error);
            } else {
                result.scores.forEach(({cellIdx, score}) => {
                    cellScoreMap.set(cellIdx, score);
                });
                aggregatedResults.performance.workerMetrics.push({
                    taskId,
                    type: 'cell',
                    ...result.metrics
                });
            }
        });
        
        // Convert cell scores to array format
        aggregatedResults.cellScores = Array.from(cells.keys()).map(cellIdx => 
            cellScoreMap.get(cellIdx) || 0
        );
        
        // Calculate parallel efficiency
        const totalWorkerTime = aggregatedResults.performance.workerMetrics
            .reduce((sum, metric) => sum + metric.duration, 0);
        aggregatedResults.performance.parallelEfficiency = 
            totalWorkerTime / aggregatedResults.performance.totalTime;
        
        console.log(`Parallel analysis complete in ${aggregatedResults.performance.totalTime.toFixed(2)}ms`);
        console.log(`Parallel efficiency: ${aggregatedResults.performance.parallelEfficiency.toFixed(2)}x`);
        
        return aggregatedResults;
        
    } finally {
        // Clean up workers
        workerManager.terminate();
    }
} 