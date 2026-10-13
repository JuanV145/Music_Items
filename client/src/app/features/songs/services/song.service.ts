import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Song } from '../models/song.model';

@Injectable({
  providedIn: 'root'
})
export class SongService {
  private apiUrl = '/api/songs';

  constructor(private http: HttpClient) { }

  async saveSong(songData: Song): Promise<Song> {
    try {
      const response = await firstValueFrom(
        this.http.post<Song>(this.apiUrl, songData)
      );

      return response;
    } catch (error) {
      console.error('Error saving song:', error);
      throw error;
    }
  }

  async loadSong(songId: number): Promise<Song> {
    try {
      const response = await firstValueFrom(
        this.http.get<Song>(`${this.apiUrl}/${songId}`)
      );

      return response;
    } catch (error) {
      console.error('Error loading song:', error);
      throw error;
    }
  }

  async getSongs(): Promise<Song[]> {
    try {
      const response = await firstValueFrom(
        this.http.get<Song[]>(this.apiUrl)
      );

      return response ?? [];
    } catch (error) {
      console.error('Error fetching songs list:', error);
      throw error;
    }
  }

  async deleteSong(songId: number): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.delete(`${this.apiUrl}/${songId}`)
      );

      return true;
    } catch (error) {
      console.error('Error deleting song:', error);
      throw error;
    }
  }
}