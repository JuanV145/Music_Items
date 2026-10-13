import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/pages/home/home.component';
import { VisualizadorComponent } from './features/songs/pages/visualizador/visualizador.component';
import { ModificarComponent } from './features/songs/pages/modificar/modificar.component';
import { MetronomeComponent } from './features/metronome/pages/metronome/metronome.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'visualizador', component: VisualizadorComponent },
  { path: 'modificar', component: ModificarComponent },
  { path: 'metronomo', component: MetronomeComponent },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];