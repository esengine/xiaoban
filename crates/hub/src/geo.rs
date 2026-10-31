use std::f64::consts::PI;

use xiaoban_protocol::Coord;

const TILE: f64 = 256.0;
const MIN_ZOOM: u8 = 3;
const MAX_ZOOM: u8 = 17;
const PADDING: f64 = 0.75;
pub const MAX_SIDE: u32 = 1024;

fn project(coord: Coord) -> (f64, f64) {
    let x = (coord.lng + 180.0) / 360.0;
    let sin = coord.lat.to_radians().sin().clamp(-0.9999, 0.9999);
    let y = 0.5 - ((1.0 + sin) / (1.0 - sin)).ln() / (4.0 * PI);
    (x, y)
}

fn unproject(x: f64, y: f64) -> Coord {
    let lat = (PI * (1.0 - 2.0 * y)).sinh().atan().to_degrees();
    Coord {
        lng: x * 360.0 - 180.0,
        lat,
    }
}

pub fn fit(points: &[Coord], width: u32, height: u32) -> Option<(Coord, u8)> {
    let projected: Vec<_> = points.iter().copied().map(project).collect();
    let (first, rest) = projected.split_first()?;
    let (mut min_x, mut max_x, mut min_y, mut max_y) = (first.0, first.0, first.1, first.1);
    for &(x, y) in rest {
        min_x = min_x.min(x);
        max_x = max_x.max(x);
        min_y = min_y.min(y);
        max_y = max_y.max(y);
    }
    let center = unproject(f64::midpoint(min_x, max_x), f64::midpoint(min_y, max_y));
    let span_x = (max_x - min_x).max(f64::EPSILON);
    let span_y = (max_y - min_y).max(f64::EPSILON);
    let fit_x = (f64::from(width) * PADDING / (span_x * TILE)).log2();
    let fit_y = (f64::from(height) * PADDING / (span_y * TILE)).log2();
    let zoom = fit_x
        .min(fit_y)
        .floor()
        .clamp(f64::from(MIN_ZOOM), f64::from(MAX_ZOOM));
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    Some((center, zoom as u8))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fits_west_lake_stops_at_a_city_zoom() {
        let stops = [
            Coord {
                lng: 120.151,
                lat: 30.258,
            },
            Coord {
                lng: 120.101,
                lat: 30.241,
            },
            Coord {
                lng: 120.170,
                lat: 30.243,
            },
        ];
        let (center, zoom) = fit(&stops, 900, 900).unwrap();
        assert!((center.lng - 120.1355).abs() < 1e-6);
        assert!((12..=15).contains(&zoom));
    }

    #[test]
    fn single_point_uses_the_closest_zoom() {
        let (_, zoom) = fit(
            &[Coord {
                lng: 116.4,
                lat: 39.9,
            }],
            600,
            600,
        )
        .unwrap();
        assert_eq!(zoom, MAX_ZOOM);
    }

    #[test]
    fn nothing_to_fit() {
        assert!(fit(&[], 600, 600).is_none());
    }
}
