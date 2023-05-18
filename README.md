# WebMissionMapping

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



