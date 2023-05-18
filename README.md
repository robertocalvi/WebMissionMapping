# WebMissionMapping

Codice del file index.js

il codice nella repository è per un'applicazione di pianificazione di missioni per droni molto completa. Ecco una descrizione più dettagliata del codice:

1.	Importazioni: vengono importati vari moduli da diverse librerie per fornire funzionalità come la mappatura, la gestione di dati geospaziali, l'interazione con l'utente, il salvataggio di file, e l'analisi dei dati.
2.	Configurazione di Firebase: Configuri e inizializzi una connessione a un progetto Firebase.
3.	Funzione init: Questa funzione viene chiamata quando l'applicazione si avvia. Configura le impostazioni per la fotocamera del drone, le impostazioni di volo, la mappatura, e altre funzionalità. All'interno di questa funzione, crei una mappa OpenLayers, configuri le sue interazioni e controlli, e imposti vari listener di eventi per gestire cose come il cambiamento delle impostazioni di volo e la creazione di un'area di interesse (AOI).
4.	Creazione di una griglia di volo: Utilizzi la libreria Turf.js per creare una griglia di volo basata sull'AOI e sulle impostazioni di volo. Questa griglia viene poi visualizzata sulla mappa.
5.	Punti di foto e waypoint: Calcoli i punti in cui il drone dovrebbe scattare foto e i waypoint in cui dovrebbe fermarsi, basandoti sulla griglia di volo e sulle impostazioni di volo. Questi punti vengono poi visualizzati sulla mappa.
6.	Salvataggio e caricamento di missioni: Fornisci la possibilità di salvare una missione in un file GeoJSON e di caricare una missione da un file GeoJSON.
7.	Altre funzioni di utilità: Hai molte altre funzioni di utilità che fanno cose come calcolare la distanza tra linee di volo o punti di foto, calcolare l'altezza di volo del drone, ruotare la griglia di volo, e così via.

Come si passa da un poligono a una serie di linee parallele?

Il codice crea una serie di linee parallele da un poligono utilizzando la libreria Turf.js. Questo si svolge nel blocco di codice che inizia con function makeGrid(aoi). 

Ecco una descrizione di come funziona:
1.	Creazione di un rettangolo di delimitazione (BoundingBox): Utilizzando turf.bbox(aoi), viene creato un rettangolo di delimitazione intorno al poligono dell'Area di Interesse (AOI).
2.	Creazione della griglia di linee: Utilizzando turf.rectangleGrid(bbox, cellSize, {units: 'degrees', mask: aoi}), viene creata una griglia di rettangoli che copre l'intero BoundingBox. L'opzione mask: aoi fa sì che solo le celle che intersecano l'AOI vengano incluse.
3.	Conversione dei rettangoli in linee: Ciascun rettangolo nella griglia è in realtà un poligono. Il codice quindi estrae le linee superiori di ciascuno di questi rettangoli usando turf.lineString(rectangle.geometry.coordinates[0].slice(0,3)), creando così una serie di linee parallele.
4.	Ordinamento delle linee: Le linee vengono quindi ordinate in base alla loro posizione lungo l'asse y (nord-sud) utilizzando una funzione di ordinamento personalizzata.
5.	Rimozione delle linee fuori dal AOI: Infine, il codice rimuove qualsiasi linea che non interseca l'AOI, lasciando solo le linee che cadono all'interno del poligono originale.
6.	Ritorno della collezione di linee: Il codice ritorna quindi una FeatureCollection di linee pronta per essere utilizzata nel resto dell'applicazione.

Ecco una breve descrizione di cosa fa il codice:

1.	Variabili PrimaryTouchId e MouseCaptureTarget: Vengono utilizzate per tracciare il punto di tocco primario (il primo dito a toccare lo schermo) e l'obiettivo degli eventi del mouse quando gli eventi del puntatore vengono catturati, rispettivamente.	
3.	Controlli PointerEvent e TouchEvent: Se il browser non supporta nativamente gli eventi del puntatore, il codice definisce un polyfill. Se il browser non supporta gli eventi touch, il polyfill crea eventi del puntatore da eventi del mouse.
4.	Funzione definePointerCapture: Questa funzione definisce come dovrebbe essere gestita la cattura del puntatore, utile per le operazioni di trascinamento. Le funzioni setCapture e releaseCapture sono metodi più vecchi per catturare eventi del mouse, e vengono ridefinite qui per gestire la cattura del puntatore.
5.	Funzione addMouseToPointerListener: Questa funzione aggiunge un listener di eventi per gli eventi del mouse e li converte in eventi del puntatore. Quindi spedisce questi eventi.
6.	Funzione addTouchToPointerListener: Questa funzione aggiunge un listener di eventi per gli eventi touch e li converte in eventi del puntatore. Gestisce più tocchi scorrendo tutti i tocchi cambiati e spedendo eventi per ciascuno.
7.	Conversioni da Mouse e Touch a Pointer: Le funzioni di conversione creano nuovi eventi con proprietà che imitano quelle degli eventi del puntatore, consentendo l'uso di gestori di eventi del puntatore anche in ambienti che supportano solo eventi Mouse o Touch.

Librerie da installare:

npm install @babel/runtime && npm install @firebase/app && npm install @turf/turf && npm install file-saver && npm install jquery && npm install mgrs && npm install ol && npm install process && npm install proj4 && npm install rbush


![mission_sample](https://github.com/robertocalvi/WebMissionMapping/assets/20637640/d78b3f52-fc95-49fa-b16b-8ddcd8366919)


Mission Designer: https://ancient.land



