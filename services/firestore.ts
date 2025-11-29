
// @ts-ignore
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, addDoc, getDocs, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { FirebaseInitResult } from './firebase';

/**
 * Realiza una prueba de conexión REAL a Cloud Firestore.
 * Escribe, Lee y Borra un documento en la colección '_diagnostics'.
 */
export const testFirestoreConnection = async (appInstance: any, uid: string): Promise<FirebaseInitResult> => {
  const TIMEOUT_MS = 5000;

  // 1. Promesa de Timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error("TIMEOUT_EXCEEDED"));
    }, TIMEOUT_MS);
  });

  // 2. Operación Real
  const operationPromise = async (): Promise<FirebaseInitResult> => {
    try {
      const db = getFirestore(appInstance);
      const docPath = `_diagnostics/test_${uid}`;
      const docRef = doc(db, "_diagnostics", `test_${uid}`);
      
      const payload = {
        check: "connectivity_test",
        timestamp: Date.now(),
        uid: uid,
        client: "web-tester"
      };

      // A. Escritura
      const start = Date.now();
      await setDoc(docRef, payload);
      
      // B. Lectura (Verificación)
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        throw new Error("El documento se escribió pero no se pudo recuperar inmediatamente (Latency/Consistency issue).");
      }

      // C. Limpieza
      await deleteDoc(docRef);
      const end = Date.now();

      return {
        success: true,
        message: "Firestore Test Exitoso",
        data: {
          path: docPath,
          latency: `${end - start}ms`,
          status: "Write/Read/Delete OK"
        }
      };

    } catch (error: any) {
      throw error;
    }
  };

  try {
    // Race: Gana el que termine primero
    return await Promise.race([operationPromise(), timeoutPromise]);

  } catch (error: any) {
    let userMessage = "Error desconocido en Firestore.";
    let technicalDetails = error.message;

    if (error.message === "TIMEOUT_EXCEEDED") {
      userMessage = "Tiempo de espera agotado (5s). Verifica tu conexión o si el servicio Firestore está habilitado en la consola.";
    } else if (error.code === 'permission-denied') {
      userMessage = "Permiso denegado. Tus Reglas de Seguridad bloquean la escritura en '_diagnostics/{docId}'.";
      technicalDetails = "Tip: Agrega 'match /_diagnostics/{doc} { allow read, write: if request.auth != null; }' a tus reglas.";
    } else if (error.code === 'unavailable') {
      userMessage = "Servicio no disponible (Offline). Verifica tu conexión a internet.";
    } else if (error.code === 'not-found') {
      userMessage = "Colección o documento no encontrado (Error lógico).";
    }

    return {
      success: false,
      message: userMessage,
      error: technicalDetails
    };
  }
};

// --- SYNTHLAB PRO BACKEND API ---

export interface MusicalPattern {
  id?: string;
  style: string;
  bpm: number;
  tracks: any;
  createdBy: string;
  createdAt: any;
  duration: number;
}

/**
 * Guarda un patrón musical de 4 compases en la colección 'patterns'.
 */
export const saveMusicalPattern = async (appInstance: any, uid: string, patternData: Omit<MusicalPattern, 'id' | 'createdAt' | 'createdBy'>): Promise<string> => {
  try {
    const db = getFirestore(appInstance);
    const patternsRef = collection(db, "patterns");
    
    const docRef = await addDoc(patternsRef, {
      ...patternData,
      createdBy: uid,
      createdAt: Timestamp.now()
    });
    
    return docRef.id;
  } catch (error: any) {
    console.error("Error saving pattern:", error);
    throw new Error(`Error al guardar en Firestore: ${error.message}`);
  }
};

/**
 * Recupera los últimos patrones musicales guardados.
 */
export const getMusicalPatterns = async (appInstance: any): Promise<MusicalPattern[]> => {
  try {
    const db = getFirestore(appInstance);
    const patternsRef = collection(db, "patterns");
    const q = query(patternsRef, orderBy("createdAt", "desc"), limit(10));
    
    const querySnapshot = await getDocs(q);
    const patterns: MusicalPattern[] = [];
    
    querySnapshot.forEach((doc: any) => {
      patterns.push({ id: doc.id, ...doc.data() });
    });
    
    return patterns;
  } catch (error: any) {
    console.error("Error loading patterns:", error);
    throw new Error(`Error al leer de Firestore: ${error.message}`);
  }
};
